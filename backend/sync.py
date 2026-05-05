import os
import imaplib
import email
import re
import hashlib
import datetime
from supabase import create_client

# Environment Variables (Set these in GitHub Secrets)
EMAIL_USER = os.environ.get("GMAIL_USER")
EMAIL_PASS = os.environ.get("GMAIL_APP_PASSWORD")
SUPA_URL = os.environ.get("VITE_SUPABASE_URL")
SUPA_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY")

supabase = create_client(SUPA_URL, SUPA_KEY)

def fetch_and_sync():
    print("Connecting to Gmail...")
    mail = imaplib.IMAP4_SSL("imap.gmail.com")
    mail.login(EMAIL_USER, EMAIL_PASS)
    mail.select("inbox")

    # 2-Day Sliding Window
    date_since = (datetime.date.today() - datetime.timedelta(days=2)).strftime("%d-%b-%Y")
    
    # Search for HDFC Alerts
    _, search_data = mail.search(None, f'(SINCE "{date_since}" FROM "alerts@hdfcbank.bank.in")')
    mail_ids = search_data[0].split()

    for m_id in mail_ids:
        _, msg_data = mail.fetch(m_id, "(RFC822)")
        msg = email.message_from_bytes(msg_data[0][1])
        
        # Get Email Body safely
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    body = part.get_payload(decode=True).decode()
        else:
            body = msg.get_payload(decode=True).decode()

        # GUARD CLAUSE: Skip Registration / Non-Transaction emails
        if "successfully registered" in body.lower() or "Rs." not in body:
            continue

        try:
            # REGEX PARSING (Adjust these based on actual HDFC formats)
            amount_match = re.search(r'Rs\.?\s*([\d,]+\.\d+)', body)
            amount = float(amount_match.group(1).replace(',', '')) if amount_match else 0.0
            
            t_type = "credit" if "credited" in body.lower() else "debit"
            
            # Find Sender/VPA
            vpa_match = re.search(r'VPA\s+([a-zA-Z0-9.\-_]+@[a-zA-Z]+)', body)
            upi_id = vpa_match.group(1) if vpa_match else "CARD/NETBANKING"
            sender_name = upi_id.split('@')[0].capitalize() # Simple fallback name
            
            # Find Ref Number
            ref_match = re.search(r'Ref(?:\.| No\.)\s*(\d{12})', body)
            
            # Synthetic Key Logic (Uses IMAP UID to prevent collisions)
            if ref_match:
                tx_ref = ref_match.group(1)
            else:
                seed = f"{amount}-{m_id.decode()}"
                tx_ref = hashlib.md5(seed.encode()).hexdigest()

            # Push to Supabase
            db_data = {
                "tx_time": msg["Date"], # Standard Email Date format
                "type": t_type,
                "amount": amount,
                "sender_name": sender_name,
                "upi_id": upi_id,
                "tx_ref": tx_ref
            }
            
            supabase.table("transactions").insert(db_data).execute()
            print(f"Added: {tx_ref}")
            
        except Exception as e:
            # Silently catch duplicates (Supabase rejects duplicate tx_ref)
            pass

    mail.logout()
    print("Sync Complete.")

if __name__ == "__main__":
    fetch_and_sync()