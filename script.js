// Mobile Menu Toggle
const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
const navMenu = document.querySelector('.nav-menu');

mobileMenuToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    const isExpanded = navMenu.classList.contains('active');
    mobileMenuToggle.setAttribute('aria-expanded', isExpanded);
    
    // Animate hamburger menu
    const spans = mobileMenuToggle.querySelectorAll('span');
    if (navMenu.classList.contains('active')) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(7px, -6px)';
    } else {
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
    }
});

// Close mobile menu when clicking on a link
const navLinks = document.querySelectorAll('.nav-link');
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        mobileMenuToggle.setAttribute('aria-expanded', 'false');
        const spans = mobileMenuToggle.querySelectorAll('span');
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
    });
});

// Scroll Progress Indicator
const scrollProgress = document.querySelector('.scroll-progress');

function updateScrollProgress() {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight - windowHeight;
    const scrolled = window.pageYOffset;
    const progress = (scrolled / documentHeight) * 100;
    
    scrollProgress.style.width = progress + '%';
    scrollProgress.setAttribute('aria-valuenow', Math.round(progress));
}

// Navbar scroll effect
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 100) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
    
    // Update scroll progress
    updateScrollProgress();
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offset = 80; // Account for fixed navbar
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
            
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// Intersection Observer for scroll animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
            
            // Add staggered animation for service cards and testimonials
            if (entry.target.classList.contains('service-card') || 
                entry.target.classList.contains('testimonial-card')) {
                const cards = entry.target.parentElement.children;
                Array.from(cards).forEach((card, index) => {
                    setTimeout(() => {
                        card.style.opacity = '0';
                        card.style.transform = 'translateY(30px)';
                        setTimeout(() => {
                            card.style.transition = 'all 0.6s ease-out';
                            card.style.opacity = '1';
                            card.style.transform = 'translateY(0)';
                        }, index * 100);
                    }, 0);
                });
                observer.unobserve(entry.target);
            }
        }
    });
}, observerOptions);

// Observe elements for animation
const animatedElements = document.querySelectorAll('.service-card, .testimonial-card, .about-content, .contact-content');
animatedElements.forEach(el => observer.observe(el));

// Contact Form Handling with Validation
const contactForm = document.getElementById('contactForm');
const formSuccess = document.getElementById('formSuccess');

// Validation functions
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhone(phone) {
    // Allow empty or valid phone format
    if (!phone) return true;
    const re = /^[\d\s\(\)\-\+]+$/;
    return re.test(phone) && phone.replace(/\D/g, '').length >= 10;
}

function showError(input, message) {
    const formGroup = input.parentElement;
    const errorMessage = formGroup.querySelector('.error-message');
    
    formGroup.classList.add('error');
    formGroup.classList.remove('success');
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
}

function showSuccess(input) {
    const formGroup = input.parentElement;
    const errorMessage = formGroup.querySelector('.error-message');
    
    formGroup.classList.remove('error');
    formGroup.classList.add('success');
    errorMessage.textContent = '';
    errorMessage.classList.remove('show');
}

function clearValidation(input) {
    const formGroup = input.parentElement;
    const errorMessage = formGroup.querySelector('.error-message');
    
    formGroup.classList.remove('error');
    formGroup.classList.remove('success');
    if (errorMessage) {
        errorMessage.textContent = '';
        errorMessage.classList.remove('show');
    }
}

// Inline validation
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const messageInput = document.getElementById('message');

nameInput.addEventListener('blur', () => {
    if (nameInput.value.trim() === '') {
        showError(nameInput, 'Name is required');
    } else if (nameInput.value.trim().length < 2) {
        showError(nameInput, 'Name must be at least 2 characters');
    } else {
        showSuccess(nameInput);
    }
});

nameInput.addEventListener('input', () => {
    if (nameInput.value.trim().length >= 2) {
        clearValidation(nameInput);
    }
});

emailInput.addEventListener('blur', () => {
    if (emailInput.value.trim() === '') {
        showError(emailInput, 'Email is required');
    } else if (!validateEmail(emailInput.value)) {
        showError(emailInput, 'Please enter a valid email address');
    } else {
        showSuccess(emailInput);
    }
});

emailInput.addEventListener('input', () => {
    if (validateEmail(emailInput.value)) {
        clearValidation(emailInput);
    }
});

phoneInput.addEventListener('blur', () => {
    if (phoneInput.value && !validatePhone(phoneInput.value)) {
        showError(phoneInput, 'Please enter a valid phone number');
    } else {
        clearValidation(phoneInput);
    }
});

contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Validate all fields
    let isValid = true;
    
    if (nameInput.value.trim() === '') {
        showError(nameInput, 'Name is required');
        isValid = false;
    } else if (nameInput.value.trim().length < 2) {
        showError(nameInput, 'Name must be at least 2 characters');
        isValid = false;
    }
    
    if (emailInput.value.trim() === '') {
        showError(emailInput, 'Email is required');
        isValid = false;
    } else if (!validateEmail(emailInput.value)) {
        showError(emailInput, 'Please enter a valid email address');
        isValid = false;
    }
    
    if (phoneInput.value && !validatePhone(phoneInput.value)) {
        showError(phoneInput, 'Please enter a valid phone number');
        isValid = false;
    }
    
    if (!isValid) {
        return;
    }
    
    // Show loading state
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    // Get form data
    const formData = {
        name: nameInput.value,
        email: emailInput.value,
        phone: phoneInput.value,
        service: document.getElementById('service').value,
        message: messageInput.value
    };
    
    // Simulate form submission (in production, this would send to a server)
    console.log('Form submitted:', formData);
    
    // Simulate network delay
    setTimeout(() => {
        // Remove loading state
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        
        // Show success message
        contactForm.style.display = 'none';
        formSuccess.style.display = 'flex';
        
        // Reset form and hide success message after 5 seconds
        setTimeout(() => {
            contactForm.reset();
            // Clear all validation states
            [nameInput, emailInput, phoneInput, messageInput].forEach(clearValidation);
            contactForm.style.display = 'flex';
            formSuccess.style.display = 'none';
        }, 5000);
    }, 1500);
});

// Add parallax effect to hero section (throttled for performance)
let ticking = false;
window.addEventListener('scroll', () => {
    if (!ticking) {
        window.requestAnimationFrame(() => {
            const scrolled = window.pageYOffset;
            const heroBackground = document.querySelector('.hero-background');
            
            if (heroBackground) {
                heroBackground.style.transform = `translateY(${scrolled * 0.5}px)`;
            }
            ticking = false;
        });
        ticking = true;
    }
});

// Counter animation for stats
const animateCounter = (element, target, duration = 2000) => {
    let start = 0;
    const increment = target / (duration / 16);
    const isPercentage = target === 100 && element.textContent.includes('%');
    
    const updateCounter = () => {
        start += increment;
        if (start < target) {
            element.textContent = Math.floor(start) + (isPercentage ? '%' : '+');
            requestAnimationFrame(updateCounter);
        } else {
            element.textContent = target + (isPercentage ? '%' : '+');
        }
    };
    
    updateCounter();
};

// Observe stats section
const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const statNumbers = document.querySelectorAll('.stat-number');
            statNumbers.forEach((stat) => {
                const text = stat.textContent;
                const value = parseInt(text.replace(/\D/g, ''));
                
                if (text.includes('%')) {
                    animateCounter(stat, value);
                } else if (text.includes('+')) {
                    animateCounter(stat, value);
                }
            });
            statsObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

const aboutSection = document.querySelector('.about-stats');
if (aboutSection) {
    statsObserver.observe(aboutSection);
}

// Add hover effect to service cards
const serviceCards = document.querySelectorAll('.service-card');
serviceCards.forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-10px) scale(1.02)';
    });
    
    card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0) scale(1)';
    });
});

// Add click ripple effect to buttons
const buttons = document.querySelectorAll('.btn');
buttons.forEach(button => {
    button.addEventListener('click', function(e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.style.position = 'absolute';
        ripple.style.borderRadius = '50%';
        ripple.style.background = 'rgba(255, 255, 255, 0.5)';
        ripple.style.transform = 'scale(0)';
        ripple.style.animation = 'ripple 0.6s ease-out';
        ripple.style.pointerEvents = 'none';
        
        this.style.position = 'relative';
        this.style.overflow = 'hidden';
        this.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    });
});

// Add CSS for ripple animation
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: scale(2);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Lazy loading for images (if images are added in the future)
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.classList.add('loaded');
                    imageObserver.unobserve(img);
                }
            }
        });
    });
    
    document.querySelectorAll('img[data-src]').forEach(img => imageObserver.observe(img));
}

// Add active state to navigation based on scroll position
const sections = document.querySelectorAll('section[id]');

const highlightNavigation = () => {
    const scrollY = window.pageYOffset;
    
    sections.forEach(section => {
        const sectionHeight = section.offsetHeight;
        const sectionTop = section.offsetTop - 100;
        const sectionId = section.getAttribute('id');
        const navLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);
        
        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
            navLinks.forEach(link => link.classList.remove('active'));
            if (navLink) {
                navLink.classList.add('active');
            }
        }
    });
};

window.addEventListener('scroll', highlightNavigation);

// Initialize
// Service Area Map and Geolocation Feature
function initServiceAreaMap() {
    const mapElement = document.getElementById('service-area-map');
    const useLocationBtn = document.getElementById('use-location');
    const checkZipBtn = document.getElementById('check-zip');
    const zipInput = document.getElementById('zip-input');
    const statusElement = document.getElementById('service-area-status');
    
    // Early return if map element or Leaflet is not available
    if (!mapElement || typeof L === 'undefined') {
        return;
    }
    
    // Constants
    const HOME_LAT = -1.2433;
    const HOME_LNG = 36.7788;
    const SERVICE_RADIUS_METERS = 12000;
    const SERVED_AREAS = [
        'BARATON', 'BARATON ESTATE', 'KITISURU', 'KITISURU ROAD', 
        'IKIGAI', 'SPRING VALLEY', 'GIGIRI', 'MUTHANGARI', 
        'LAVINGTON', '00621'
    ];
    
    // Initialize map
    const map = L.map('service-area-map').setView([HOME_LAT, HOME_LNG], 13);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Add home location marker
    const homeMarker = L.marker([HOME_LAT, HOME_LNG]).addTo(map);
    homeMarker.bindPopup('AM Mowing – Main Office<br>Ikigai, Nairobi (Kitisuru area)');
    
    // Draw service radius circle
    const serviceCircle = L.circle([HOME_LAT, HOME_LNG], {
        color: '#0066cc',
        fillColor: '#0066cc',
        fillOpacity: 0.15,
        radius: SERVICE_RADIUS_METERS
    }).addTo(map);
    
    // User location marker (initially null)
    let userMarker = null;
    
    // Helper function to set status message
    function setStatus(message, type) {
        if (!statusElement) return;
        
        statusElement.textContent = message;
        statusElement.classList.remove('service-area-status--ok', 'service-area-status--warn');
        
        if (type === 'success') {
            statusElement.classList.add('service-area-status--ok');
        } else if (type === 'warning') {
            statusElement.classList.add('service-area-status--warn');
        }
    }
    
    // Geolocation button handler
    if (useLocationBtn) {
        useLocationBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                setStatus('Geolocation is not supported by your browser. Please use the estate/postal code input below.', 'warning');
                return;
            }
            
            setStatus('Getting your location...', '');
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userLat = position.coords.latitude;
                    const userLng = position.coords.longitude;
                    
                    // Remove existing user marker if any
                    if (userMarker) {
                        map.removeLayer(userMarker);
                    }
                    
                    // Add user location marker
                    userMarker = L.marker([userLat, userLng], {
                        icon: L.icon({
                            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                            iconSize: [25, 41],
                            iconAnchor: [12, 41],
                            popupAnchor: [1, -34],
                            shadowSize: [41, 41]
                        })
                    }).addTo(map);
                    userMarker.bindPopup('Your Location').openPopup();
                    
                    // Center map on user location
                    map.setView([userLat, userLng], 14);
                    
                    // Calculate distance from home to user
                    const homeLatLng = L.latLng(HOME_LAT, HOME_LNG);
                    const userLatLng = L.latLng(userLat, userLng);
                    const distance = homeLatLng.distanceTo(userLatLng);
                    
                    // Check if within service area
                    if (distance <= SERVICE_RADIUS_METERS) {
                        setStatus('Great news! You are within our service area around Ikigai, Baraton Estate, and Kitisuru Road. You can book a service today.', 'success');
                    } else {
                        setStatus('You appear to be outside our standard service area. Please contact us to confirm if we can service your location.', 'warning');
                    }
                },
                (error) => {
                    let errorMessage = 'Unable to get your location. ';
                    if (error.code === error.PERMISSION_DENIED) {
                        errorMessage += 'Location access was denied. Please use the estate/postal code input below.';
                    } else if (error.code === error.POSITION_UNAVAILABLE) {
                        errorMessage += 'Location information is unavailable. Please use the estate/postal code input below.';
                    } else if (error.code === error.TIMEOUT) {
                        errorMessage += 'Location request timed out. Please try again or use the estate/postal code input below.';
                    } else {
                        errorMessage += 'Please use the estate/postal code input below.';
                    }
                    setStatus(errorMessage, 'warning');
                }
            );
        });
    }
    
    // Function to check estate/postal code
    function checkAreaCode() {
        if (!zipInput || !statusElement) return;
        
        const input = zipInput.value.trim();
        
        if (input === '') {
            setStatus('Please enter your estate name or postal code.', 'warning');
            return;
        }
        
        // Normalize input: uppercase, collapse spaces
        const normalizedInput = input.toUpperCase().replace(/\s+/g, ' ');
        
        // Check if input matches any served area
        const isServed = SERVED_AREAS.some(area => normalizedInput.includes(area) || area.includes(normalizedInput));
        
        if (isServed) {
            setStatus(`Great news! ${input} is in our service area. We'd be happy to serve you!`, 'success');
        } else {
            setStatus(`${input} is not in our standard listed areas, but we may still be able to help. Please contact us for a custom quote.`, 'warning');
        }
    }
    
    // Check button handler
    if (checkZipBtn) {
        checkZipBtn.addEventListener('click', checkAreaCode);
    }
    
    // Enter key handler for input
    if (zipInput) {
        zipInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                checkAreaCode();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Add fade-in animation to hero content on load
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
        heroContent.style.opacity = '0';
        setTimeout(() => {
            heroContent.style.transition = 'opacity 1s ease-in';
            heroContent.style.opacity = '1';
        }, 100);
    }
    
    // Set current year in footer
    const currentYearElement = document.getElementById('currentYear');
    if (currentYearElement) {
        currentYearElement.textContent = new Date().getFullYear();
    }
    
    // FAQ Accordion functionality
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const isExpanded = question.getAttribute('aria-expanded') === 'true';
            const answer = question.nextElementSibling;
            
            // Close all other FAQs
            faqQuestions.forEach(q => {
                if (q !== question) {
                    q.setAttribute('aria-expanded', 'false');
                    q.nextElementSibling.classList.remove('active');
                }
            });
            
            // Toggle current FAQ
            question.setAttribute('aria-expanded', !isExpanded);
            answer.classList.toggle('active');
        });
    });
    
    // Hide floating CTA on contact section
    const floatingCta = document.querySelector('.floating-cta');
    const contactSection = document.getElementById('contact');
    
    if (floatingCta && contactSection) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    floatingCta.style.opacity = '0';
                    floatingCta.style.pointerEvents = 'none';
                } else {
                    floatingCta.style.opacity = '1';
                    floatingCta.style.pointerEvents = 'auto';
                }
            });
        }, { threshold: 0.1 });
        
        observer.observe(contactSection);
    }
    
    // Initialize service area map
    initServiceAreaMap();
    
    console.log('Friendly Telegram website loaded successfully!');
});
