document.addEventListener('DOMContentLoaded', function() {
    const bookingForm = document.getElementById('bookingForm');
    const confirmationMessage = document.getElementById('confirmationMessage');

    // Set minimum date to today
    const dateInput = document.getElementById('date');
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);

    bookingForm.addEventListener('submit', function(e) {
        e.preventDefault();

        // Validate form
        if (!validateForm()) {
            return;
        }

        // Get form data
        const formData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            address: document.getElementById('address').value,
            service: document.getElementById('service').value,
            date: document.getElementById('date').value,
            time: document.getElementById('time').value,
            notes: document.getElementById('notes').value
        };

        // Log booking data (in a real application, this would be sent to a server)
        console.log('Booking submitted:', formData);

        // Show confirmation message
        bookingForm.style.display = 'none';
        confirmationMessage.style.display = 'block';

        // Scroll to confirmation
        confirmationMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Reset form and show it again after 5 seconds
        setTimeout(function() {
            bookingForm.reset();
            bookingForm.style.display = 'block';
            confirmationMessage.style.display = 'none';
        }, 5000);
    });

    function validateForm() {
        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const address = document.getElementById('address').value.trim();
        const service = document.getElementById('service').value;
        const date = document.getElementById('date').value;

        // Name validation
        if (name.length < 2) {
            alert('Please enter a valid name.');
            document.getElementById('name').focus();
            return false;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            alert('Please enter a valid email address.');
            document.getElementById('email').focus();
            return false;
        }

        // Phone validation (basic)
        const phoneRegex = /^[\d\s\-\+\(\)]+$/;
        const digitCount = phone.replace(/\D/g, '').length;
        if (!phoneRegex.test(phone) || digitCount < 10) {
            alert('Please enter a valid phone number with at least 10 digits.');
            document.getElementById('phone').focus();
            return false;
        }

        // Address validation
        if (address.length < 5) {
            alert('Please enter a valid service address.');
            document.getElementById('address').focus();
            return false;
        }

        // Service validation
        if (!service) {
            alert('Please select a service type.');
            document.getElementById('service').focus();
            return false;
        }

        // Date validation
        if (!date) {
            alert('Please select a preferred date.');
            document.getElementById('date').focus();
            return false;
        }

        const selectedDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (selectedDate < today) {
            alert('Please select a date that is today or in the future.');
            document.getElementById('date').focus();
            return false;
        }

        return true;
    }

    // Add smooth scrolling for better UX
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});
