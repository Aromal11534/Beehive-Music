import smtplib
from email.message import EmailMessage
import logging
from app.core.config import get_settings

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.settings = get_settings()

    def send_email(self, to_email: str, subject: str, body_text: str, body_html: str | None = None):
        """Send an email using SMTP."""
        if not self.settings.smtp_host or not self.settings.smtp_user or not self.settings.smtp_password:
            logger.warning("SMTP configuration is incomplete. Skipping email sending.")
            return False

        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = f"{self.settings.smtp_from_name} <{self.settings.smtp_from_email}>"
        msg['To'] = to_email
        msg.set_content(body_text)
        
        if body_html:
            msg.add_alternative(body_html, subtype='html')

        try:
            with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port) as server:
                server.starttls()
                server.login(self.settings.smtp_user, self.settings.smtp_password)
                server.send_message(msg)
            logger.info(f"Successfully sent email to {to_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

    def send_welcome_email(self, to_email: str, display_name: str):
        subject = "Welcome to Beehive Music!"
        text = f"Hi {display_name},\n\nWelcome to Beehive Music! We're excited to have you on board.\n\nEnjoy controlling your music!"
        html = f"""
        <html>
            <body>
                <h2>Welcome to Beehive Music!</h2>
                <p>Hi {display_name},</p>
                <p>We're excited to have you on board. You can now sync, play, and manage your Discord music queues.</p>
                <p>Enjoy controlling your music!</p>
            </body>
        </html>
        """
        return self.send_email(to_email, subject, text, html)

    def send_password_reset_email(self, to_email: str, reset_token: str):
        reset_link = f"{self.settings.frontend_url}/login?reset={reset_token}"
        subject = "Reset your Beehive password"
        text = f"You requested a password reset.\n\nPlease visit the following link to reset your password:\n{reset_link}\n\nIf you did not request this, please ignore this email."
        html = f"""
        <html>
            <body>
                <h2>Password Reset Request</h2>
                <p>You recently requested to reset your password for your Beehive account.</p>
                <p>Click the link below to reset it:</p>
                <a href="{reset_link}">{reset_link}</a>
                <br><br>
                <p>If you did not request a password reset, please ignore this email.</p>
            </body>
        </html>
        """
        return self.send_email(to_email, subject, text, html)
