import os
import imaplib
import email
import re
import hashlib
import datetime
from email.utils import parsedate_to_datetime
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

    # 1-Day Sliding Window
    date_since = (datetime.date.today() - datetime.timedelta(days=1)).strftime("%d-%b-%Y")
    
    # Search for HDFC Alerts
    _, search_data = mail.search(None, f'(SINCE "{date_since}" FROM "alerts@hdfcbank.bank.in")')
    mail_ids = search_data[0].split()
    print(f"Found {len(mail_ids)} emails from HDFC in last 1 day")

    # Fetch all recent tx_refs from Supabase ONCE to save network time
    print("Fetching existing records from DB...")
    recent_db_tx = supabase.table("transactions").select("tx_ref").execute()
    existing_refs = {row["tx_ref"] for row in recent_db_tx.data} # Store in a fast Python Set
    
    for m_id in mail_ids:
        _, msg_data = mail.fetch(m_id, "(RFC822)")
        msg = email.message_from_bytes(msg_data[0][1])
        
        sender = msg.get("From", "Unknown")
        subject = msg.get("Subject", "No Subject")
        email_date = msg.get("Date", "")
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
        # Skip limit increase / non-transaction emails
        if "transfer limit" in body.lower() or "limit applicable" in body.lower():
            print(f"  -> Skipped: Limit notification")
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
            # Try new format first: "Sender: NAME (VPA: upi_id)" or "b. Sender: NAME (VPA: upi_id)"
            # Also try old format: "by VPA [upi_id] [name] on [date]"
            
            # New format pattern: captures name before (VPA: upi_id)
            # Name can be ALL CAPS or Title Case, allows letters, spaces, and dots
            vpa_match_new = re.search(r'Sender:\s*([A-Za-z\s.]+)\s*\(VPA:\s*([a-zA-Z0-9.\-_]+@[a-zA-Z]+)\)', body)
            
            # Old format pattern: captures VPA then optional name before "on date"
            vpa_match_old = re.search(r'VPA\s+([a-zA-Z0-9.\-_]+@[a-zA-Z]+)(?:\s+(.*?)\s+on\s+\d{2}-\d{2}-\d{2})?', body)
            
            if vpa_match_new:
                # New format: Group 1 is name, Group 2 is UPI
                sender_name = vpa_match_new.group(1).strip().title()
                upi_id = vpa_match_new.group(2)
            elif vpa_match_old:
                upi_id = vpa_match_old.group(1)
                extracted_name = vpa_match_old.group(2)
                
                # Use the real name if found, otherwise fallback to VPA prefix
                if extracted_name and extracted_name.strip():
                    sender_name = extracted_name.strip().title()
                else:
                    sender_name = upi_id.split('@')[0].capitalize()
            else:
                upi_id = "CARD/NETBANKING"
                sender_name = "Unknown"
            
            # 3. TRANSACTION REFERENCE PARSING
            # Try multiple patterns:
            # 1. New format: "UPI Reference No.: 123456789012345" (15 digits)
            # 2. Old format: "Ref No. 123456789012" or "reference number is 123456789012" (12 digits)
            ref_match = re.search(r'(?:UPI Reference No\.|Reference No\.|reference number is|Ref(?:\.\s| No\.))\s*[:\.]?\s*(\d{12,16})', body, re.IGNORECASE)
            
            if ref_match:
                tx_ref = ref_match.group(1)
            else:
                seed = f"{amount}-{m_id.decode()}"
                tx_ref = hashlib.md5(seed.encode()).hexdigest()

            # Instant memory check instead of network check
            if tx_ref in existing_refs:
                print(f"  -> Skipped: Already in database ({tx_ref})")
                continue # Skip to the next email without attempting insert
                
            # Parse email date for transaction timestamp
            try:
                dt = parsedate_to_datetime(email_date)
                # Fix 2-digit year parsing - ensure 2026 not 2025
                if dt.year < 2020:
                    dt = dt.replace(year=dt.year + 100)
                
                # Check if email header had +0530 (IST) timezone
                # If so, the time is already correct
                # If not (e.g., +0000 or no timezone), add 5:30
                has_ist_offset = "+0530" in email_date or "+330" in email_date
                
                if dt.tzinfo is not None:
                    # Strip timezone to get naive datetime
                    dt = dt.replace(tzinfo=None)
                
                if not has_ist_offset:
                    # Add 5:30 for IST conversion
                    dt = dt + datetime.timedelta(hours=5, minutes=30)
                
                tx_time = dt.strftime("%Y-%m-%d %H:%M:%S")
            except:
                tx_time = None

            # Push to Supabase with email timestamp
            db_data = {
                "tx_time": tx_time,
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
