import os
import imaplib
import email
import re
import hashlib
import datetime
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()  # Load .env file if present

# Environment Variables (Set these in GitHub Secrets)
EMAIL_USER = os.environ.get("GMAIL_USER")
EMAIL_PASS = os.environ.get("GMAIL_APP_PASSWORD")
SUPA_URL = os.environ.get("VITE_SUPABASE_URL")
# Use Service Role Key for backend (bypasses RLS), fallback to anon key for compatibility
SUPA_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")

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
    print(f"Found {len(mail_ids)} emails from HDFC in last 2 days")

    for m_id in mail_ids:
        _, msg_data = mail.fetch(m_id, "(RFC822)")
        msg = email.message_from_bytes(msg_data[0][1])
        
        sender = msg.get("From", "Unknown")
        subject = msg.get("Subject", "No Subject")
        print(f"Processing: {sender} | {subject[:50]}...")
        
        # Get Email Body (try plain text first, fallback to HTML)
        body = ""
        html_body = ""
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                if content_type == "text/plain":
                    body = part.get_payload(decode=True).decode(errors='ignore')
                elif content_type == "text/html":
                    html_body = part.get_payload(decode=True).decode(errors='ignore')
        else:
            body = msg.get_payload(decode=True).decode(errors='ignore')
        
        # If no plain text, use HTML (strip tags roughly)
        if not body and html_body:
            import re as regex
            body = regex.sub(r'<[^>]+>', ' ', html_body)
            body = regex.sub(r'\s+', ' ', body)

        # GUARD CLAUSE: Skip Registration / Non-Transaction emails
        if "successfully registered" in body.lower():
            print(f"  -> Skipped: Registration email")
            continue
        # Check for transaction indicators: Rs., INR, ₹, or amount patterns
        has_currency = "Rs." in body or "INR" in body or "₹" in body
        if not has_currency:
            print(f"  -> Skipped: No currency found (contains: {body[:150]}...)")
            continue

        try:
            # 1. AMOUNT PARSING
            amount_match = re.search(r'(?:Rs\.?|INR|₹)\s*([\d,]+\.\d+)', body, re.IGNORECASE)
            amount = float(amount_match.group(1).replace(',', '')) if amount_match else 0.0
            
            t_type = "credit" if "credited" in body.lower() else "debit"
            
            # 2. VPA & SENDER NAME PARSING
            # Matches: "...by VPA [upi_id] [Actual Name] on [DD-MM-YY]..."
            vpa_match = re.search(r'VPA\s+([a-zA-Z0-9.\-_]+@[a-zA-Z]+)(?:\s+(.*?)\s+on\s+\d{2}-\d{2}-\d{2})?', body)
            
            if vpa_match:
                upi_id = vpa_match.group(1)
                extracted_name = vpa_match.group(2)
                
                # Use the real name if found, otherwise fallback to VPA prefix
                if extracted_name and extracted_name.strip():
                    sender_name = extracted_name.strip().title()
                else:
                    sender_name = upi_id.split('@')[0].capitalize()
            else:
                upi_id = "CARD/NETBANKING"
                sender_name = "Unknown"
            
            # 3. TRANSACTION REFERENCE PARSING
            # Matches both "Ref No. 123" and "reference number is 123"
            ref_match = re.search(r'(?:reference number is|Ref(?:\.| No\.))\s*(\d{12})', body, re.IGNORECASE)
            
            if ref_match:
                tx_ref = ref_match.group(1)
            else:
                seed = f"{amount}-{m_id.decode()}"
                tx_ref = hashlib.md5(seed.encode()).hexdigest()

            # Check if transaction already exists to prevent burning tx_no sequences
            existing = supabase.table("transactions").select("id").eq("tx_ref", tx_ref).execute()
            if len(existing.data) > 0:
                print(f"  -> Skipped: Already in database ({tx_ref})")
                continue # Skip to the next email without attempting insert

            # Push to Supabase
            db_data = {
                "tx_time": msg["Date"], 
                "type": t_type,
                "amount": amount,
                "sender_name": sender_name,
                "upi_id": upi_id,
                "tx_ref": tx_ref
            }
            
            supabase.table("transactions").insert(db_data).execute()
            print(f"Added: {tx_ref} from {sender_name}")
            
        except Exception as e:
            if "duplicate" not in str(e).lower():
                print(f"Error processing email: {e}")

    mail.logout()
    print("Sync Complete.")

if __name__ == "__main__":
    fetch_and_sync()