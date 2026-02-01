// Mobile Menu Toggle
const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
const navMenu = document.querySelector('.nav-menu');

mobileMenuToggle.addEventListener('click', () => {
    const isExpanded = navMenu.classList.toggle('active');
    
    // Update ARIA attribute for accessibility
    mobileMenuToggle.setAttribute('aria-expanded', isExpanded);
    
    // Animate hamburger menu
    const spans = mobileMenuToggle.querySelectorAll('span');
    if (isExpanded) {
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
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrollPercent = (scrollTop / scrollHeight) * 100;
    
    scrollProgress.style.width = scrollPercent + '%';
    scrollProgress.setAttribute('aria-valuenow', Math.round(scrollPercent));
}

window.addEventListener('scroll', updateScrollProgress);
updateScrollProgress(); // Initialize

// Navbar scroll effect
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 100) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
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

// Contact Form Handling
const contactForm = document.getElementById('contactForm');
const formSuccess = document.getElementById('formSuccess');

// Form validation helpers
function validateEmail(email) {
    // Prefer native HTML5 email validation when available
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.value = email;

    if (typeof emailInput.checkValidity === 'function') {
        return emailInput.checkValidity();
    }

    // Fallback to a more robust regex if native validation is unavailable
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
    return re.test(email);
}

function validatePhone(phone) {
    if (!phone) return true; // Phone is optional
    const re = /^[\d\s\-\+\(\)]+$/;
    return re.test(phone) && phone.replace(/\D/g, '').length >= 10;
}

function showError(inputId, errorId, show = true) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    
    if (show) {
        input.classList.add('error');
        error.classList.add('visible');
    } else {
        input.classList.remove('error');
        error.classList.remove('visible');
    }
}

// Real-time validation
document.getElementById('email').addEventListener('blur', function() {
    const email = this.value.trim();
    if (email && !validateEmail(email)) {
        showError('email', 'email-error', true);
    } else {
        showError('email', 'email-error', false);
    }
});

document.getElementById('phone').addEventListener('blur', function() {
    const phone = this.value.trim();
    if (phone && !validatePhone(phone)) {
        showError('phone', 'phone-error', true);
    } else {
        showError('phone', 'phone-error', false);
    }
});

document.getElementById('name').addEventListener('blur', function() {
    const name = this.value.trim();
    if (name && name.length < 2) {
        showError('name', 'name-error', true);
    } else {
        showError('name', 'name-error', false);
    }
});

contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Get form data
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const service = document.getElementById('service').value;
    const message = document.getElementById('message').value.trim();
    
    let isValid = true;
    
    // Validate name
    if (!name || name.length < 2) {
        showError('name', 'name-error', true);
        isValid = false;
    } else {
        showError('name', 'name-error', false);
    }
    
    // Validate email
    if (!email || !validateEmail(email)) {
        showError('email', 'email-error', true);
        isValid = false;
    } else {
        showError('email', 'email-error', false);
    }
    
    // Validate phone (if provided)
    if (phone && !validatePhone(phone)) {
        showError('phone', 'phone-error', true);
        isValid = false;
    } else {
        showError('phone', 'phone-error', false);
    }
    
    if (!isValid) {
        return;
    }
    
    const formData = { name, email, phone, service, message };
    
    // Simulate form submission (in production, this would send to a server)
    console.log('Form submitted:', formData);
    
    // Show success message
    contactForm.style.display = 'none';
    formSuccess.classList.add('visible');
    
    // Reset form and hide success message after 5 seconds
    setTimeout(() => {
        contactForm.reset();
        contactForm.style.display = 'flex';
        formSuccess.classList.remove('visible');
    }, 5000);
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
    
    console.log('Friendly Telegram website loaded successfully!');
});
