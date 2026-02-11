"""
Email sending utilities
"""
import logging
from typing import List, Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import aiosmtplib

from app.config import settings

logger = logging.getLogger(__name__)


async def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None
) -> bool:
    """
    Send an email using SMTP
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        html_content: HTML content of the email
        text_content: Plain text content (optional)
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    try:
        # Create message
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        message["To"] = to_email
        
        # Add text/plain part
        if text_content:
            text_part = MIMEText(text_content, "plain")
            message.attach(text_part)
        
        # Add text/html part
        html_part = MIMEText(html_content, "html")
        message.attach(html_part)
        
        # Send email
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            await aiosmtplib.send(
                message,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                use_tls=True,
            )
            logger.info(f"Email sent successfully to {to_email}")
            return True
        else:
            logger.warning("SMTP credentials not configured. Email not sent.")
            logger.info(f"Would have sent email to {to_email} with subject: {subject}")
            return False
            
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return False


async def send_contact_form_notification(contact_data: dict) -> bool:
    """Send notification email for new contact form submission"""
    subject = f"New Contact Form Submission from {contact_data['full_name']}"
    
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #2e7d32;">New Contact Form Submission</h2>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px;">
                <p><strong>Name:</strong> {contact_data['full_name']}</p>
                <p><strong>Email:</strong> {contact_data['email']}</p>
                <p><strong>Phone:</strong> {contact_data.get('phone', 'Not provided')}</p>
                <p><strong>Subject:</strong> {contact_data.get('subject', 'Not provided')}</p>
                <p><strong>Service Type:</strong> {contact_data.get('service_type', 'Not specified')}</p>
                <p><strong>Message:</strong></p>
                <div style="background-color: white; padding: 15px; border-left: 3px solid #2e7d32;">
                    {contact_data['message']}
                </div>
            </div>
        </body>
    </html>
    """
    
    return await send_email(settings.ADMIN_EMAIL, subject, html_content)


async def send_quote_confirmation(quote_data: dict) -> bool:
    """Send confirmation email for quote request"""
    subject = "Quote Request Confirmation - AM Mowing"
    
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #2e7d32;">Quote Request Received</h2>
            <p>Dear {quote_data['full_name']},</p>
            <p>Thank you for your quote request. We have received your information and will get back to you within 24 hours.</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <h3 style="color: #2e7d32;">Your Request Details:</h3>
                <p><strong>Service Type:</strong> {quote_data['service_type']}</p>
                <p><strong>Property Address:</strong> {quote_data['address']}</p>
                <p><strong>Property Size:</strong> {quote_data.get('property_size', 'Not specified')} sqm</p>
            </div>
            
            <p>If you have any questions in the meantime, please don't hesitate to contact us.</p>
            <p>Best regards,<br>The AM Mowing Team</p>
        </body>
    </html>
    """
    
    return await send_email(quote_data['email'], subject, html_content)


async def send_appointment_confirmation(appointment_data: dict) -> bool:
    """Send confirmation email for appointment booking"""
    subject = "Appointment Confirmation - AM Mowing"
    
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #2e7d32;">Appointment Confirmed</h2>
            <p>Dear {appointment_data['full_name']},</p>
            <p>Your appointment has been successfully scheduled!</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <h3 style="color: #2e7d32;">Appointment Details:</h3>
                <p><strong>Service:</strong> {appointment_data['service_type']}</p>
                <p><strong>Date & Time:</strong> {appointment_data['scheduled_date']}</p>
                <p><strong>Location:</strong> {appointment_data['address']}</p>
                <p><strong>Duration:</strong> {appointment_data.get('duration_minutes', 60)} minutes</p>
            </div>
            
            <p>We'll send you a reminder 24 hours before your appointment.</p>
            <p>Best regards,<br>The AM Mowing Team</p>
        </body>
    </html>
    """
    
    return await send_email(appointment_data['email'], subject, html_content)


async def send_welcome_email(user_data: dict) -> bool:
    """Send welcome email to new user"""
    subject = "Welcome to AM Mowing!"
    
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #2e7d32;">Welcome to AM Mowing!</h2>
            <p>Dear {user_data['full_name']},</p>
            <p>Thank you for registering with AM Mowing. We're excited to have you as part of our community!</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <h3 style="color: #2e7d32;">What's Next?</h3>
                <ul>
                    <li>Browse our comprehensive lawn care services</li>
                    <li>Request a free quote for your property</li>
                    <li>Schedule an appointment at your convenience</li>
                    <li>Track your service history</li>
                </ul>
            </div>
            
            <p>If you have any questions, our team is always here to help.</p>
            <p>Best regards,<br>The AM Mowing Team</p>
        </body>
    </html>
    """
    
    return await send_email(user_data['email'], subject, html_content)
