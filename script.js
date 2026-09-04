// Mobile Menu Toggle
const navMenu = document.querySelector('.nav-menu');

// PWA standalone detection — force mobile layout when installed as app
(function () {
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    // Fallback: if standalone detection fails but screen is phone-sized, also force mobile
    if (!isStandalone && window.matchMedia('(display-mode: standalone)').media !== 'not all') {
        // matchMedia is supported but didn't match — check if we're in a TWA or other wrapper
        try {
            if (document.referrer && document.referrer.indexOf('android-app://') === 0) {
                isStandalone = true;
            }
        } catch (e) {}
    }

    if (isStandalone) {
        document.documentElement.classList.add('pwa-standalone');
        document.body.classList.add('pwa-standalone');

        // Maintain standard responsive viewport
        var viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
        }

        // Constrain body width to prevent desktop layout bleed
        document.documentElement.style.maxWidth = '100vw';
        document.documentElement.style.overflowX = 'hidden';
        document.body.style.maxWidth = '100vw';
        document.body.style.overflowX = 'hidden';
    }
})();

// Directory menu toggle (desktop and mobile)
const directoryToggle = document.querySelector('.directory-toggle');
const directoryPanel = document.querySelector('.directory-panel');
const mainHeader = document.getElementById('main-header');

function setDirectoryMenuState(open) {
    if (!directoryToggle || !directoryPanel || !mainHeader) return;

    mainHeader.classList.toggle('menu-open', open);
    directoryToggle.setAttribute('aria-expanded', String(open));
    directoryPanel.setAttribute('aria-hidden', String(!open));
}

if (directoryToggle && directoryPanel && mainHeader) {
    directoryToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = mainHeader.classList.contains('menu-open');
        setDirectoryMenuState(!isOpen);
    });

    document.addEventListener('click', (event) => {
        if (!mainHeader.contains(event.target)) {
            setDirectoryMenuState(false);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setDirectoryMenuState(false);
        }
    });
}

// Close directory panel when clicking on any link inside it
const directoryLinks = document.querySelectorAll('.directory-panel a');
directoryLinks.forEach(link => {
    link.addEventListener('click', () => {
        setDirectoryMenuState(false);
    });
});

// Scroll Progress Indicator
const scrollProgress = document.querySelector('.scroll-progress');

function updateScrollProgress() {
    if (!scrollProgress) return;

    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight - windowHeight;
    const scrolled = window.pageYOffset;
    const progress = (scrolled / documentHeight) * 100;
    
    scrollProgress.style.width = progress + '%';
    scrollProgress.setAttribute('aria-valuenow', Math.round(progress));
}

// Navbar scroll effect
const navbar = document.querySelector('.navbar, #main-header');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (navbar) {
        if (currentScroll > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }
    
    // Update scroll progress
    updateScrollProgress();
});

// Seamless smooth scroll for anchor links and in-page sections
function scrollToTargetWithOffset(target, hash) {
    if (!target) return;
    const offset = 80; // Account for fixed navbar
    const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
    
    window.scrollTo({
        top: Math.max(0, targetPosition),
        behavior: 'smooth'
    });

    if (hash && window.history && window.history.pushState) {
        window.history.pushState(null, '', hash);
    }
}

// Global click handler for anchor navigation
document.addEventListener('click', function (e) {
    const anchor = e.target.closest('a[href*="#"]');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    // Determine target selector
    let targetSelector = null;
    if (href.startsWith('#')) {
        targetSelector = href;
    } else if (href.startsWith('/#') && (window.location.pathname === '/' || window.location.pathname.endsWith('index.html'))) {
        targetSelector = href.substring(1);
    }

    if (targetSelector && targetSelector.length > 1) {
        const target = document.querySelector(targetSelector);
        if (target) {
            e.preventDefault();
            scrollToTargetWithOffset(target, targetSelector);

            // Close directory menu if open
            if (typeof setDirectoryMenuState === 'function') {
                setDirectoryMenuState(false);
            }
        }
    }
});

// Handle hash landing on page load
window.addEventListener('DOMContentLoaded', () => {
    if (window.location.hash) {
        setTimeout(() => {
            const target = document.querySelector(window.location.hash);
            if (target) {
                scrollToTargetWithOffset(target);
            }
        }, 200);
    }
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
const formError = document.getElementById('formError');

function resolveApiBase() {
    if (typeof window === 'undefined') return '/api';
    if (window.LAWNCRAFT_API_BASE) return window.LAWNCRAFT_API_BASE;

    return '/api';
}

const API_BASE_URL = resolveApiBase();

function resolveContactSubmitUrl() {
    if (typeof window === 'undefined') return '/api/contact';
    if (window.LAWNCRAFT_CONTACT_API_URL) return window.LAWNCRAFT_CONTACT_API_URL;

    const apiBase = resolveApiBase();
    if (apiBase) {
        return apiBase.endsWith('/') ? `${apiBase}contact` : `${apiBase}/contact`;
    }

    const { protocol } = window.location;
    if (protocol === 'file:') return 'http://127.0.0.1:3001/api/contact';

    // Keep contact submission same-origin in deployed environments so Vercel
    // can proxy the request via /api/contact.
    return '/api/contact';
}

function getContactSubmitUrl() {
    const url = resolveContactSubmitUrl();

    if (!url) {
        return '/api/contact';
    }

    if (typeof window === 'undefined') {
        return url;
    }

    const isAbsoluteUrl = /^https?:\/\//i.test(url);
    if (!isAbsoluteUrl) {
        return url.startsWith('/') ? url : `/${url}`;
    }

    return url;
}

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

function hideFormMessages() {
    if (formSuccess) formSuccess.style.display = 'none';
    if (formError) {
        formError.textContent = '';
        formError.style.display = 'none';
    }
}

function showFormError(message) {
    if (!formError) return;
    formError.textContent = message;
    formError.style.display = 'flex';
}

async function parseApiError(response, fallbackMessage) {
    try {
        const body = await response.json();
        if (body?.error?.fields && typeof body.error.fields === 'object') {
            const fieldMsgs = Object.values(body.error.fields).filter(Boolean);
            if (fieldMsgs.length > 0) return fieldMsgs.join(' ');
        }
        return body?.error?.message || body?.message || body?.detail || fallbackMessage;
    } catch (_) {
        return fallbackMessage;
    }
}

function buildContactPayload(formData) {
    const contextLines = [];
    if (formData.address) contextLines.push(`Address: ${formData.address}`);
    if (formData.service) contextLines.push(`Service of Interest: ${formData.service}`);
    if (formData.propertyType) contextLines.push(`Property Type: ${formData.propertyType}`);
    if (formData.preferredDate) contextLines.push(`Preferred Start Date: ${formData.preferredDate}`);

    const userMessage = (formData.message || '').trim();
    const contextMessage = contextLines.join('\n');
    let message = userMessage;
    if (userMessage && contextMessage) {
        message = `${userMessage}\n\n${contextMessage}`;
    } else if (contextMessage) {
        message = `Consultation request:\n${contextMessage}`;
    } else if (!userMessage) {
        message = 'Website consultation request for lawn care services.';
    }

    return {
        name: (formData.name || '').trim(),
        email: (formData.email || '').trim(),
        phone: (formData.phone || '').trim(),
        message,
    };
}

// Submit a quote request to the backend `/api/quotes` endpoint.
// Accepts an object with friendly form field names (name, email, phone, address, service, propertyType,
// preferredDate, message, propertySize, serviceFrequency) and maps them to the API `QuoteCreate` schema.
async function submitQuoteRequest(formData) {
    const payload = {
        full_name: (formData.name || formData.full_name || '').trim(),
        email: (formData.email || '').trim(),
        phone: (formData.phone || '').trim(),
        address: (formData.address || '').trim() || null,
        property_size: formData.propertySize ? Number(formData.propertySize) : null,
        property_type: formData.propertyType || formData.property_type || null,
        service_type: formData.service || formData.service_type || null,
        service_frequency: formData.serviceFrequency || formData.service_frequency || null,
        preferred_start_date: formData.preferredDate ? new Date(formData.preferredDate).toISOString() : null,
        additional_details: formData.message || formData.additional_details || null
    };

    const res = await fetch(`${API_BASE_URL}/quotes`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        let detail = 'Unable to submit quote request.';
        try {
            const body = await res.json();
            if (body?.detail) {
                detail = Array.isArray(body.detail)
                    ? body.detail.map(d => d.msg || d).join(', ')
                    : body.detail;
            }
        } catch (_) {
            // ignore JSON parse errors
        }
        const err = new Error(detail);
        err.response = res;
        throw err;
    }

    return res.json().catch(() => ({}));
}

// Expose helper globally for other inline scripts to call (e.g. await submitQuoteRequest(formData))
window.submitQuoteRequest = submitQuoteRequest;

// Inline validation
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const messageInput = document.getElementById('message');

if (contactForm && nameInput && emailInput && phoneInput && messageInput) {
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
        if (phoneInput.value.trim() === '') {
            clearValidation(phoneInput); // required check fires on submit
        } else if (!validatePhone(phoneInput.value)) {
            showError(phoneInput, 'Please enter a valid phone number');
        } else {
            showSuccess(phoneInput);
        }
    });

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideFormMessages();
        
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
        
        if (phoneInput.value.trim() === '') {
            showError(phoneInput, 'Phone number is required');
            isValid = false;
        } else if (!validatePhone(phoneInput.value)) {
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
        function getOptionalFieldValue(id) {
            const el = document.getElementById(id);
            return el ? el.value : '';
        }
        const formData = {
            name: nameInput.value,
            email: emailInput.value,
            phone: phoneInput.value,
            address: getOptionalFieldValue('address'),
            service: getOptionalFieldValue('service'),
            propertyType: getOptionalFieldValue('property-type'),
            preferredDate: getOptionalFieldValue('preferred-date'),
            message: messageInput.value
        };

        try {
            const payload = buildContactPayload(formData);
            const contactSubmitUrl = getContactSubmitUrl();
            const response = await fetch(contactSubmitUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const detail = await parseApiError(
                    response,
                    'We could not submit your request right now. Please check your connection and try again.'
                );
                throw new Error(detail);
            }

            await response.json().catch(() => ({}));

            // Remove loading state
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            
            // Show success message
            contactForm.style.display = 'none';
            if (formSuccess) formSuccess.style.display = 'flex';
            
            // Reset form and hide success message after 5 seconds
            setTimeout(() => {
                contactForm.reset();
                // Clear all validation states
                [nameInput, emailInput, phoneInput, messageInput].forEach(clearValidation);
                contactForm.style.display = 'flex';
                if (formSuccess) formSuccess.style.display = 'none';
            }, 5000);
        } catch (err) {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;

            showFormError(err.message || 'Submission failed. Please try again.');
        }
    });
}
(function initParallaxScroll() {
    let scrollTicking = false;
    window.addEventListener('scroll', () => {
        if (!scrollTicking) {
            window.requestAnimationFrame(() => {
                const scrolled = window.pageYOffset || document.documentElement.scrollTop || 0;
                const heroBackground = document.querySelector('.hero-background');
                
                if (heroBackground) {
                    heroBackground.style.transform = `translateY(${scrolled * 0.5}px)`;
                }
                scrollTicking = false;
            });
            scrollTicking = true;
        }
    }, { passive: true });
})();

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
const highlightSections = Array.from(document.querySelectorAll('section[id]'));
let scrollSpyTicking = false;

const highlightNavigation = () => {
    const scrollY = window.pageYOffset;
    const headerOffset = 100;
    const navItems = Array.from(document.querySelectorAll('.nav-links a, .hero-quick-chip'));

    if (!navItems.length) return;

    let activeId = '';
    if (scrollY < 200) {
        activeId = 'home';
    } else {
        for (let i = highlightSections.length - 1; i >= 0; i--) {
            const section = highlightSections[i];
            const top = section.offsetTop - headerOffset;
            if (scrollY >= top) {
                activeId = section.getAttribute('id');
                break;
            }
        }
    }

    if (activeId) {
        navItems.forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;
            const isMatch = href === `#${activeId}` ||
                           href === `/#${activeId}` ||
                           (activeId === 'home' && (href === '/' || href === '#home')) ||
                           (activeId === 'services' && (href === '/services' || href === '#services')) ||
                           (activeId === 'pricing-calculator' && (href === '/calculator' || href === '#pricing-calculator')) ||
                           (activeId === 'insights' && (href === '/insights' || href === '#insights')) ||
                           (activeId === 'contact' && (href === '/contact' || href === '#contact'));

            if (isMatch) {
                link.classList.add('active');
            } else if (!link.classList.contains('hero-quick-chip')) {
                link.classList.remove('active');
            }
        });
    }
};

window.addEventListener('scroll', () => {
    if (!scrollSpyTicking) {
        window.requestAnimationFrame(() => {
            highlightNavigation();
            scrollSpyTicking = false;
        });
        scrollSpyTicking = true;
    }
}, { passive: true });

// Run initial highlight check
highlightNavigation();

// Initialize
// Service Area — shared constants used by both the map and the chip panel
const SERVICE_AREA_CONFIG = {
    HOME_LAT: -1.2433,
    HOME_LNG: 36.7788,
    SERVICE_RADIUS_METERS: 25000,
    SERVED_AREAS: [
        'BARATON', 'BARATON ESTATE', 'KITISURU', 'KITISURU ROAD',
        'IKIGAI', 'SPRING VALLEY', 'GIGIRI', 'MUTHANGARI',
        'LAVINGTON', 'WESTLANDS', 'PARKLANDS', 'RUNDA', 'MUTHAIGA',
        'KIAMBU ROAD', 'RUIRU', 'RUIRU ESTATE', 'THIKA ROAD',
        'KASARANI', 'ROYSAMBU', 'KAHAWA', 'MEMBLEY',
        'SYOKIMAU', 'MLOLONGO', 'ATHI RIVER',
        'NGONG ROAD', 'LANGATA', 'KAREN', 'RONGAI',
        'KILIMANI', 'KILELESHWA', 'HURLINGHAM', 'UPPER HILL',
        'NAIROBI CBD', 'CBD', 'CITY CENTRE', 'RIDGEWAYS',
        'GARDEN ESTATE', 'ZIMMERMANN', 'SOUTH B', 'SOUTH C',
        'LIMURU ROAD', 'BANANA', 'WANGIGE', 'RUAKA',
        'IMARA DAIMA', 'PIPELINE', 'EMBAKASI', 'DONHOLM',
        'KOMAROCK', 'FEDHA ESTATE', 'GREENSPAN',
        'KIAMBU', 'THIKA', 'JUJA',
        '00621', '00100', '00200', '00300', '00606', '00400', '00502', '00515', '00600'
    ],
    PROMINENT_AREAS: [
        { name: 'Westlands',    lat: -1.2634, lng: 36.8119 },
        { name: 'Parklands',    lat: -1.2638, lng: 36.8226 },
        { name: 'Lavington',    lat: -1.2878, lng: 36.7696 },
        { name: 'Karen',        lat: -1.3194, lng: 36.6875 },
        { name: 'Runda',        lat: -1.2065, lng: 36.8052 },
        { name: 'Muthaiga',     lat: -1.2296, lng: 36.8296 },
        { name: 'Gigiri',       lat: -1.2201, lng: 36.8085 },
        { name: 'Spring Valley',lat: -1.2482, lng: 36.7822 },
        { name: 'Ruiru',        lat: -1.1459, lng: 36.9610 },
        { name: 'Syokimau',     lat: -1.3582, lng: 36.9043 },
        { name: 'Kasarani',     lat: -1.2196, lng: 36.8971 },
        { name: 'Langata',      lat: -1.3333, lng: 36.7500 },
        { name: 'Kilimani',     lat: -1.2908, lng: 36.7830 },
        { name: 'Kileleshwa',   lat: -1.2733, lng: 36.7717 },
        { name: 'Ridgeways',    lat: -1.1825, lng: 36.8230 },
        { name: 'South C',      lat: -1.3228, lng: 36.8235 },
        { name: 'South B',      lat: -1.3100, lng: 36.8380 },
        { name: 'Kahawa',       lat: -1.1904, lng: 36.9196 },
        { name: 'Roysambu',     lat: -1.2082, lng: 36.9003 },
        { name: 'Ruaka',        lat: -1.2070, lng: 36.7450 },
    ]
};

// Area chip panel — works independently of Leaflet
function initAreaChips() {
    const zipInput = document.getElementById('zip-input');
    const statusElement = document.getElementById('service-area-status');
    const areaChips = document.querySelectorAll('.area-chip');

    if (!areaChips.length) return;

    function setChipStatus(message, type) {
        if (!statusElement) return;
        statusElement.textContent = message;
        statusElement.classList.remove('service-area-status--ok', 'service-area-status--warn');
        if (type === 'success') {
            statusElement.classList.add('service-area-status--ok');
        } else if (type === 'warning') {
            statusElement.classList.add('service-area-status--warn');
        }
    }

    areaChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const areaName = chip.dataset.area;
            if (zipInput) {
                zipInput.value = areaName;
            }

            // Highlight the selected chip
            areaChips.forEach(c => c.classList.remove('area-chip--active'));
            chip.classList.add('area-chip--active');

            // Pan the map to the matching prominent area (if Leaflet map is available)
            if (window._serviceAreaMap) {
                const match = SERVICE_AREA_CONFIG.PROMINENT_AREAS.find(
                    a => a.name.toLowerCase() === areaName.toLowerCase()
                );
                if (match) {
                    window._serviceAreaMap.setView([match.lat, match.lng], 14);
                }
            }

            // Show coverage status
            const normalizedName = areaName.toUpperCase().replace(/\s+/g, ' ');
            const isServed = SERVICE_AREA_CONFIG.SERVED_AREAS.some(
                area => normalizedName.includes(area) || area.includes(normalizedName)
            );
            if (isServed) {
                setChipStatus(`Great news! ${areaName} is in our service area. We'd be happy to serve you!`, 'success');
            } else {
                setChipStatus(`${areaName} is not in our standard listed areas, but we may still be able to help. Please contact us for a custom quote.`, 'warning');
            }
        });
    });
}

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
    
    // Unpack constants from shared config
    const HOME_LAT = SERVICE_AREA_CONFIG.HOME_LAT;
    const HOME_LNG = SERVICE_AREA_CONFIG.HOME_LNG;
    const SERVICE_RADIUS_METERS = SERVICE_AREA_CONFIG.SERVICE_RADIUS_METERS;
    const SERVED_AREAS = SERVICE_AREA_CONFIG.SERVED_AREAS;
    const PROMINENT_AREAS = SERVICE_AREA_CONFIG.PROMINENT_AREAS;
    
    // Initialize map
    const map = L.map('service-area-map').setView([HOME_LAT, HOME_LNG], 11);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Add home location marker
    const homeMarker = L.marker([HOME_LAT, HOME_LNG]).addTo(map);
    homeMarker.bindPopup('Lawn Craft – Main Office<br>Ikigai, Nairobi (Kitisuru area)');
    
    // Draw service radius circle
    const serviceCircle = L.circle([HOME_LAT, HOME_LNG], {
        color: '#0066cc',
        fillColor: '#0066cc',
        fillOpacity: 0.15,
        radius: SERVICE_RADIUS_METERS
    }).addTo(map);

    // Add labeled markers for prominent areas within the coverage circle
    PROMINENT_AREAS.forEach(area => {
        const areaIcon = L.divIcon({
            className: 'area-label-marker',
            html: `<span class="area-label-text">${area.name}</span>`,
            iconAnchor: [0, 0]
        });
        const marker = L.marker([area.lat, area.lng], { icon: areaIcon }).addTo(map);
        marker.bindPopup(
            `<strong>${area.name}</strong><br>Within our service area. <a href="/contact">Book a service</a>.`
        );
        marker.on('click', () => {
            if (zipInput) {
                zipInput.value = area.name;
            }
            setStatus(`Great news! ${area.name} is in our service area. We'd be happy to serve you!`, 'success');
        });
    });

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
                        setStatus('Great news! You are within our service area. We cover Nairobi and surrounding areas up to 25 km from our base. You can book a service today.', 'success');
                    } else {
                        setStatus('You appear to be outside our standard service area. Please contact us to confirm — we may still be able to arrange a visit for your location.', 'warning');
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

    // Wire the area chip panel to the Leaflet map so chips also pan the map
    window._serviceAreaMap = map;
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
    
    // Initialize area chip panel (works without Leaflet — Leaflet map adds map-panning enhancement)
    initAreaChips();

    // Initialize service area map (adds labeled area markers and stores map ref for chip panning)
    initServiceAreaMap();
    
    // Get performance timing
    const [perf] = performance.getEntriesByType("navigation");
    
    // Send performance and hardware analytics
    if (perf) {
        fetch('/api/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                page: window.location.pathname,
                referrer: document.referrer || "Direct",
                // Performance data in seconds
                loadTime: (perf.loadEventEnd / 1000).toFixed(2) + "s",
                // Connection speed
                effectiveType: navigator.connection ? navigator.connection.effectiveType : "unknown",
                // Device Memory (RAM) in GB
                memory: navigator.deviceMemory || "unknown",
            }),
            keepalive: true 
        }).catch(() => {
            // Non-blocking telemetry
        });
    }
    
    console.log('Lawn Craft website loaded successfully!');

    // Cookie Consent Banner
    (function () {
        const COOKIE_KEY = 'lawn-craft-cookies-accepted';
        if (localStorage.getItem(COOKIE_KEY) !== null) return;

        function showCookieBanner() {
            if (document.getElementById('cookie-consent')) return;

            const banner = document.createElement('div');
            banner.id = 'cookie-consent';
            banner.className = 'cookie-consent';
            banner.setAttribute('role', 'complementary');
            banner.setAttribute('aria-label', 'Cookie consent');
            banner.innerHTML = `
                <div class="cookie-consent-text">
                    <p>We use cookies to enhance your browsing experience and analyze site traffic. By clicking "Accept All", you consent to our use of cookies. Read our <a href="/privacy-policy">Privacy Policy</a> for more information.</p>
                </div>
                <div class="cookie-consent-actions">
                    <button class="btn-cookie-accept" type="button">Accept All</button>
                    <button class="btn-cookie-decline" type="button">Decline</button>
                </div>
            `;
            document.body.appendChild(banner);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    banner.classList.add('visible');
                });
            });

            banner.querySelector('.btn-cookie-accept').addEventListener('click', () => {
                localStorage.setItem(COOKIE_KEY, 'accepted');
                banner.classList.remove('visible');
                setTimeout(() => banner.remove(), 400);
            });

            banner.querySelector('.btn-cookie-decline').addEventListener('click', () => {
                localStorage.setItem(COOKIE_KEY, 'declined');
                banner.classList.remove('visible');
                setTimeout(() => banner.remove(), 400);
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showCookieBanner);
        } else {
            showCookieBanner();
        }
    })();

    // =========================================================
    // Enhanced PWA Install & Android Safety System
    // =========================================================
    (function () {
        const DISMISSED_KEY = 'lawn-craft-install-dismissed-v2';
        let deferredPrompt = null;
        window.deferredPwaPrompt = null;

        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                             window.navigator.standalone === true ||
                             document.referrer.includes('android-app://');

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            window.deferredPwaPrompt = e;
            
            // If user hasn't dismissed and not already installed, show banner
            if (!isStandalone && localStorage.getItem(DISMISSED_KEY) !== '1') {
                showInstallBanner();
            }
            updateInstallButtonStates();
        });

        function updateInstallButtonStates() {
            document.querySelectorAll('.btn-pwa-install').forEach(btn => {
                btn.classList.add('ready');
            });
        }

        // Global opener for PWA Install & Safety Modal
        window.openPwaInstallModal = function (focusNotice) {
            let modalBackdrop = document.getElementById('pwa-install-modal');
            if (!modalBackdrop) {
                modalBackdrop = createPwaModal();
            }

            modalBackdrop.classList.add('active');
            document.body.style.overflow = 'hidden';

            if (focusNotice) {
                const noticeEl = modalBackdrop.querySelector('.pwa-android-notice');
                if (noticeEl) {
                    setTimeout(() => {
                        noticeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        noticeEl.classList.add('highlight-pulse');
                        setTimeout(() => noticeEl.classList.remove('highlight-pulse'), 1500);
                    }, 200);
                }
            }
        };

        window.closePwaInstallModal = function () {
            const modalBackdrop = document.getElementById('pwa-install-modal');
            if (modalBackdrop) {
                modalBackdrop.classList.remove('active');
                document.body.style.overflow = '';
            }
        };

        function createPwaModal() {
            const backdrop = document.createElement('div');
            backdrop.id = 'pwa-install-modal';
            backdrop.className = 'pwa-modal-backdrop';
            backdrop.innerHTML = `
                <div class="pwa-modal-card" role="dialog" aria-modal="true" aria-labelledby="pwa-modal-title">
                    <button class="pwa-modal-close" type="button" aria-label="Close Install Modal">&times;</button>
                    
                    <div class="pwa-modal-header">
                        <img src="/assets/icons/icon-192.png" alt="Lawn Craft Logo" class="pwa-modal-icon" width="60" height="60">
                        <div>
                            <h3 id="pwa-modal-title">Install Lawn Craft App</h3>
                            <p class="pwa-modal-subtitle">Instant booking, price calculator, and lawn care scheduling right from your home screen.</p>
                        </div>
                    </div>

                    <div class="pwa-security-guarantee">
                        <div class="sec-icon"><i class="fa-solid fa-shield-halved"></i></div>
                        <div class="sec-text">
                            <strong>100% Certified Safe Progressive Web App</strong>
                            <p>Runs entirely inside your browser's secure sandbox. Zero access to your personal files, zero background tracking, zero native APK risks.</p>
                        </div>
                    </div>

                    <!-- Android Safety & Play Protect Clarity Section -->
                    <div class="pwa-android-notice">
                        <div class="notice-badge"><i class="fa-brands fa-android"></i> Important Android Safety Notice</div>
                        <h4>Seeing: "App built for an older version of Android / doesn't include latest privacy protections"?</h4>
                        <p><strong>Why this happens:</strong> On certain Android devices (especially Samsung Galaxy phones using Samsung Internet or older WebAPK handlers), Google Play Protect displays an automated generic warning when adding a web shortcut.</p>
                        <p><strong>Is Lawn Craft safe?</strong> <span class="badge-safe">YES, 100% SAFE</span>. Lawn Craft does NOT install native code or binaries. It is an encrypted web app adhering to current W3C standards.</p>
                        <div class="notice-action-tip">
                            <i class="fa-solid fa-circle-check"></i> <strong>How to proceed:</strong> Simply tap <strong>"Install anyway"</strong> or follow the browser steps below.
                        </div>
                    </div>

                    <div class="pwa-action-block">
                        <button class="btn btn-primary btn-pwa-direct-install" type="button">
                            <i class="fa-solid fa-download"></i> <span>Install to Home Screen</span>
                        </button>
                        <span class="pwa-action-caption">No app store account required • Less than 1MB storage</span>
                    </div>

                    <!-- Platform Step-by-Step Instructions -->
                    <div class="pwa-tabs-section">
                        <h4>Manual Installation Guide</h4>
                        <div class="pwa-platform-grid">
                            <div class="platform-guide-item">
                                <div class="platform-icon"><i class="fa-brands fa-chrome"></i> Chrome / Android</div>
                                <ol>
                                    <li>Tap the <strong>three dots (⋮)</strong> at the top right of Chrome.</li>
                                    <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                                    <li>If prompted, confirm by tapping <strong>Install anyway</strong>.</li>
                                </ol>
                            </div>
                            <div class="platform-guide-item">
                                <div class="platform-icon"><i class="fa-solid fa-mobile-screen-button"></i> Samsung Internet</div>
                                <ol>
                                    <li>Tap the <strong>Menu icon (☰)</strong> at the bottom bar.</li>
                                    <li>Select <strong>"Add page to"</strong> &rarr; <strong>"Home screen"</strong>.</li>
                                    <li>Tap <strong>"Add"</strong> to place the icon on your screen.</li>
                                </ol>
                            </div>
                            <div class="platform-guide-item">
                                <div class="platform-icon"><i class="fa-brands fa-apple"></i> iPhone & iPad (Safari)</div>
                                <ol>
                                    <li>Tap the <strong>Share button (<i class="fa-solid fa-arrow-up-from-bracket"></i>)</strong> in Safari.</li>
                                    <li>Scroll down and select <strong>"Add to Home Screen"</strong>.</li>
                                    <li>Tap <strong>"Add"</strong> in the top right corner.</li>
                                </ol>
                            </div>
                        </div>
                    </div>

                    <div class="pwa-modal-footer">
                        <button class="btn-pwa-dismiss-modal" type="button">Got it, close</button>
                    </div>
                </div>
            `;

            document.body.appendChild(backdrop);

            // Bind events
            backdrop.querySelector('.pwa-modal-close').addEventListener('click', window.closePwaInstallModal);
            backdrop.querySelector('.btn-pwa-dismiss-modal').addEventListener('click', window.closePwaInstallModal);
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    window.closePwaInstallModal();
                }
            });

            // Direct install button
            backdrop.querySelector('.btn-pwa-direct-install').addEventListener('click', async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        window.closePwaInstallModal();
                        hideInstallBanner();
                    }
                    deferredPrompt = null;
                } else {
                    // Explain manual fallback
                    alert('To install, tap your browser menu (three dots ⋮ or Share icon) and select "Add to Home Screen" or "Install App".');
                }
            });

            return backdrop;
        }

        function showInstallBanner() {
            if (document.getElementById('install-banner') || isStandalone) return;

            const banner = document.createElement('div');
            banner.id = 'install-banner';
            banner.className = 'install-banner';
            banner.setAttribute('role', 'complementary');
            banner.setAttribute('aria-label', 'Install Lawn Craft app');
            banner.innerHTML = `
                <div class="install-banner-icon">
                    <img src="/assets/icons/icon-192.png" alt="" width="40" height="40">
                </div>
                <div class="install-banner-text">
                    <strong>Install Lawn Craft App</strong>
                    <span>Fast booking, lawn tracking & offline access • 100% Secure PWA</span>
                </div>
                <div class="install-banner-actions">
                    <button class="btn-install" type="button"><i class="fa-solid fa-download"></i> Install</button>
                    <button class="btn-safety-info" type="button" title="View device safety & privacy information">
                        <i class="fa-solid fa-shield-halved"></i> Safety Info
                    </button>
                    <button class="btn-dismiss" type="button" aria-label="Dismiss install prompt">&times;</button>
                </div>
            `;
            document.body.appendChild(banner);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    banner.classList.add('visible');
                });
            });

            banner.querySelector('.btn-install').addEventListener('click', async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        hideInstallBanner();
                    }
                    deferredPrompt = null;
                } else {
                    window.openPwaInstallModal(false);
                }
            });

            banner.querySelector('.btn-safety-info').addEventListener('click', () => {
                window.openPwaInstallModal(true);
            });

            banner.querySelector('.btn-dismiss').addEventListener('click', () => {
                localStorage.setItem(DISMISSED_KEY, '1');
                hideInstallBanner();
            });
        }

        function hideInstallBanner() {
            const banner = document.getElementById('install-banner');
            if (banner) {
                banner.classList.remove('visible');
                setTimeout(() => banner.remove(), 400);
            }
        }

        // Global trigger for any .btn-pwa-install button
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-pwa-install');
            if (btn) {
                e.preventDefault();
                window.openPwaInstallModal(false);
            }
        });

        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            window.deferredPwaPrompt = null;
            hideInstallBanner();
            window.closePwaInstallModal();
        });
    })();
});
