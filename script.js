// ========================================
// BLOG DATA AND CONFIGURATION
// ========================================
const blogPosts = [
    {
        id: 1,
        title: "Spring Lawn Care: Essential Tips for a Lush Green Lawn",
        slug: "spring-lawn-care-tips",
        excerpt: "Discover the best practices for preparing your lawn for the growing season, from fertilization to weed control.",
        date: "2024-03-15",
        category: "Seasonal Care",
        image: "https://images.unsplash.com/photo-1592376213295-b63f5e59acdf?w=800&h=600&fit=crop",
        content: `
            <p>Spring is the perfect time to revitalize your lawn after the harsh winter months. Here are our top tips for achieving a lush, healthy lawn:</p>
            <h3>1. Clean Up and Assess</h3>
            <p>Remove any debris, fallen branches, and dead grass that accumulated over winter. This allows you to assess the current state of your lawn.</p>
            <h3>2. Soil Testing</h3>
            <p>Test your soil's pH levels to ensure optimal growing conditions. Most grass types prefer a pH between 6.0 and 7.0.</p>
            <h3>3. Aeration</h3>
            <p>Aerate compacted soil to improve water and nutrient absorption. This is especially important for high-traffic areas.</p>
            <h3>4. Fertilization</h3>
            <p>Apply a slow-release fertilizer to provide essential nutrients throughout the growing season.</p>
        `
    },
    {
        id: 2,
        title: "The Benefits of Professional Lawn Maintenance",
        slug: "professional-lawn-maintenance-benefits",
        excerpt: "Learn why investing in professional lawn care services can save you time, money, and ensure a healthier lawn.",
        date: "2024-03-08",
        category: "Lawn Care",
        image: "https://images.unsplash.com/photo-1587009327283-f828eb523056?w=800&h=600&fit=crop",
        content: `
            <p>While DIY lawn care might seem cost-effective, professional services offer numerous advantages that make them worth the investment.</p>
            <h3>Expertise and Experience</h3>
            <p>Professional lawn care technicians have years of training and experience dealing with various lawn conditions and challenges.</p>
            <h3>Time Savings</h3>
            <p>Free up your weekends for activities you enjoy while we handle the hard work of maintaining your lawn.</p>
            <h3>Consistent Results</h3>
            <p>Regular professional maintenance ensures your lawn stays healthy and beautiful throughout the year.</p>
        `
    },
    {
        id: 3,
        title: "How to Prevent Common Lawn Diseases",
        slug: "prevent-lawn-diseases",
        excerpt: "Protect your lawn from common diseases with these preventive measures and early detection strategies.",
        date: "2024-02-28",
        category: "Health & Maintenance",
        image: "https://images.unsplash.com/photo-1563514227147-6d2ff665a6a0?w=800&h=600&fit=crop",
        content: `
            <p>Lawn diseases can quickly turn a beautiful yard into a patchy, brown mess. Here's how to prevent common issues:</p>
            <h3>Proper Watering</h3>
            <p>Water deeply but infrequently to encourage deep root growth. Water early in the morning to allow grass blades to dry.</p>
            <h3>Good Air Circulation</h3>
            <p>Keep grass at the proper height and avoid overcrowding to promote air circulation.</p>
            <h3>Regular Monitoring</h3>
            <p>Inspect your lawn regularly for signs of disease and treat problems early.</p>
        `
    },
    {
        id: 4,
        title: "Eco-Friendly Lawn Care Practices",
        slug: "eco-friendly-lawn-care",
        excerpt: "Sustainable lawn care practices that are good for your yard and the environment.",
        date: "2024-02-20",
        category: "Sustainability",
        image: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&h=600&fit=crop",
        content: `
            <p>Create a beautiful lawn while being environmentally responsible with these eco-friendly practices:</p>
            <h3>Organic Fertilizers</h3>
            <p>Use organic fertilizers that release nutrients slowly and improve soil health naturally.</p>
            <h3>Native Grass Species</h3>
            <p>Choose native grass varieties that require less water and maintenance.</p>
            <h3>Natural Pest Control</h3>
            <p>Encourage beneficial insects and use natural pest control methods when possible.</p>
        `
    },
    {
        id: 5,
        title: "Understanding Different Types of Grass",
        slug: "types-of-grass",
        excerpt: "A comprehensive guide to choosing the right grass type for your climate and lawn usage.",
        date: "2024-02-10",
        category: "Lawn Care",
        image: "https://images.unsplash.com/photo-1534832025-0a072f93aa6f?w=800&h=600&fit=crop",
        content: `
            <p>Selecting the right grass type is crucial for a healthy, low-maintenance lawn. Here's what you need to know:</p>
            <h3>Cool-Season Grasses</h3>
            <p>Kentucky Bluegrass, Perennial Ryegrass, and Fescues thrive in northern climates with cold winters.</p>
            <h3>Warm-Season Grasses</h3>
            <p>Bermuda, Zoysia, and St. Augustine grasses are ideal for southern regions with hot summers.</p>
            <h3>Choosing the Right Type</h3>
            <p>Consider your climate, sun exposure, and lawn usage when selecting grass varieties.</p>
        `
    },
    {
        id: 6,
        title: "Fall Lawn Preparation Checklist",
        slug: "fall-lawn-preparation",
        excerpt: "Prepare your lawn for winter with this essential fall maintenance checklist.",
        date: "2024-01-25",
        category: "Seasonal Care",
        image: "https://images.unsplash.com/photo-1621574124692-0f2f6f0a6c05?w=800&h=600&fit=crop",
        content: `
            <p>Fall is a critical time for lawn care. These tasks will help your lawn survive winter and thrive in spring:</p>
            <h3>Overseeding</h3>
            <p>Fill in bare spots and thicken your lawn by overseeding in early fall.</p>
            <h3>Final Fertilization</h3>
            <p>Apply a winterizing fertilizer to strengthen roots and prepare for dormancy.</p>
            <h3>Leaf Management</h3>
            <p>Remove fallen leaves regularly to prevent suffocation and disease.</p>
        `
    }
];

// Service area coverage - zip codes for mock checker
const serviceAreas = {
    covered: ['10001', '10002', '10003', '10004', '10005', '10010', '10011', '10012', '10013', '10014',
              '10016', '10017', '10018', '10019', '10020', '10021', '10022', '10023', '10024', '10025'],
    nearby: ['10006', '10007', '10008', '10009', '10015', '10026', '10027', '10028', '10029', '10030']
};

// Utility: Debounce function for performance
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Utility: Throttle function for performance
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

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

// Navbar scroll effect (throttled for performance)
const navbar = document.querySelector('.navbar');

const handleScroll = throttle(() => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 100) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
    
    // Update scroll progress
    updateScrollProgress();
}, 100);

window.addEventListener('scroll', handleScroll);

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

// Add active state to navigation based on scroll position (throttled)
const sections = document.querySelectorAll('section[id]');

const highlightNavigation = throttle(() => {
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
}, 200);

window.addEventListener('scroll', highlightNavigation);

// ========================================
// BLOG FUNCTIONALITY
// ========================================
let currentBlogPage = 1;
const postsPerPage = 6;

function renderBlogPosts(page = 1) {
    const blogGrid = document.getElementById('blogGrid');
    if (!blogGrid) return;
    
    const startIndex = (page - 1) * postsPerPage;
    const endIndex = startIndex + postsPerPage;
    const postsToShow = blogPosts.slice(startIndex, endIndex);
    
    if (page === 1) {
        blogGrid.innerHTML = '';
    }
    
    postsToShow.forEach(post => {
        const postCard = document.createElement('article');
        postCard.className = 'blog-card';
        postCard.innerHTML = `
            <div class="blog-card-image">
                <img data-src="${post.image}" alt="${post.title}" loading="lazy">
            </div>
            <div class="blog-card-content">
                <span class="blog-category">${post.category}</span>
                <h3 class="blog-title">${post.title}</h3>
                <p class="blog-excerpt">${post.excerpt}</p>
                <div class="blog-meta">
                    <span class="blog-date">${new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    <a href="#" class="blog-read-more" data-post-id="${post.id}">Read more →</a>
                </div>
            </div>
        `;
        blogGrid.appendChild(postCard);
    });
    
    // Initialize lazy loading for newly added images
    initLazyLoading();
    
    // Update load more button
    const loadMoreBtn = document.getElementById('blogLoadMore');
    if (loadMoreBtn) {
        if (endIndex >= blogPosts.length) {
            loadMoreBtn.style.display = 'none';
        } else {
            loadMoreBtn.style.display = 'inline-block';
        }
    }
}

function openBlogPost(postId) {
    const post = blogPosts.find(p => p.id === parseInt(postId));
    if (!post) return;
    
    const modal = document.getElementById('blogModal');
    if (!modal) return;
    
    document.getElementById('modalPostCategory').textContent = post.category;
    document.getElementById('modalPostTitle').textContent = post.title;
    document.getElementById('modalPostDate').textContent = new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('modalPostContent').innerHTML = post.content;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Accessibility: transfer keyboard focus to modal
    requestAnimationFrame(() => {
        const modalCloseBtn = modal.querySelector('#blogModalClose');
        modalCloseBtn && modalCloseBtn.focus();
    });
}

function closeBlogPost() {
    const modal = document.getElementById('blogModal');
    if (!modal) return;
    
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// ========================================
// ZIP CODE CHECKER
// ========================================
function checkZipCode(zipCode) {
    const resultDiv = document.getElementById('zipCheckResult');
    if (!resultDiv) return;
    
    // Normalize zip code
    const normalizedZip = zipCode.trim();
    
    if (normalizedZip.length !== 5 || !/^\d{5}$/.test(normalizedZip)) {
        resultDiv.innerHTML = `
            <div class="zip-result error" role="alert">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p>Please enter a valid 5-digit ZIP code</p>
            </div>
        `;
        return;
    }
    
    if (serviceAreas.covered.includes(normalizedZip)) {
        resultDiv.innerHTML = `
            <div class="zip-result success" role="alert">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <div>
                    <p><strong>Great news!</strong> We service your area.</p>
                    <a href="#contact" class="btn btn-primary mt-1">Get a Free Quote</a>
                </div>
            </div>
        `;
    } else if (serviceAreas.nearby.includes(normalizedZip)) {
        resultDiv.innerHTML = `
            <div class="zip-result warning" role="alert">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <div>
                    <p>You're close! We may be able to service your area.</p>
                    <a href="#contact" class="btn btn-secondary mt-1">Contact Us</a>
                </div>
            </div>
        `;
    } else {
        resultDiv.innerHTML = `
            <div class="zip-result error" role="alert">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <div>
                    <p>Sorry, we don't currently service this area.</p>
                    <p class="small">We're expanding! Check back soon.</p>
                </div>
            </div>
        `;
    }
}

// ========================================
// NEWSLETTER SIGNUP
// ========================================
function subscribeNewsletter(email) {
    const resultDiv = document.getElementById('newsletterResult');
    const form = document.getElementById('newsletterForm');
    
    if (!resultDiv || !form) return;
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        resultDiv.innerHTML = `
            <div class="form-message error" role="alert">
                Please enter a valid email address
            </div>
        `;
        return;
    }
    
    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    // Simulate API call
    setTimeout(() => {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        
        resultDiv.innerHTML = `
            <div class="form-message success" role="alert">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <span>Successfully subscribed! Check your email for confirmation.</span>
            </div>
        `;
        
        form.reset();
        
        // Hide success message after 5 seconds
        setTimeout(() => {
            resultDiv.innerHTML = '';
        }, 5000);
    }, 1500);
}

// ========================================
// LAYOUT TOGGLE (Grid/List View)
// ========================================
function initLayoutToggle() {
    const toggleButtons = document.querySelectorAll('[data-layout-toggle]');
    const savedLayout = localStorage.getItem('preferredLayout') || 'grid';

    // Helper to apply layout for a specific button without simulating a click
    function applyLayoutForButton(btn) {
        const layout = btn.dataset.layoutToggle;
        const container = document.querySelector(btn.dataset.target);

        if (container) {
            container.classList.remove('layout-grid', 'layout-list');
            container.classList.add(`layout-${layout}`);

            // Update button states
            toggleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Save preference
            localStorage.setItem('preferredLayout', layout);
        }
    }
    
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            applyLayoutForButton(btn);
        });
        
        // Apply saved layout directly without triggering a click event
        if (btn.dataset.layoutToggle === savedLayout) {
            applyLayoutForButton(btn);
        }
    });
}

// ========================================
// LAZY LOADING IMAGES
// ========================================
function initLazyLoading() {
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
    } else {
        // Fallback for browsers without IntersectionObserver
        document.querySelectorAll('img[data-src]').forEach(img => {
            img.src = img.dataset.src;
        });
    }
}

// ========================================
// GALLERY PAGINATION
// ========================================
let currentGalleryPage = 1;
const itemsPerGalleryPage = 5;

let galleryHiddenClassInitialized = false;

function ensureGalleryHiddenClass() {
    if (galleryHiddenClassInitialized) return;

    const style = document.createElement('style');
    style.type = 'text/css';
    style.textContent = '.gallery-hidden { display: none !important; }';
    document.head.appendChild(style);

    galleryHiddenClassInitialized = true;
}

function renderGalleryPage(page) {
    const galleryContainer = document.getElementById('showcaseGallery');
    if (!galleryContainer) return;

    ensureGalleryHiddenClass();
    
    const galleryImages = galleryContainer.querySelectorAll('.showcase-image');
    const totalPages = Math.ceil(galleryImages.length / itemsPerGalleryPage);
    
    // Hide all images
    galleryImages.forEach(img => img.classList.add('gallery-hidden'));
    
    // Show current page images
    const start = (page - 1) * itemsPerGalleryPage;
    const end = start + itemsPerGalleryPage;
    for (let i = start; i < end && i < galleryImages.length; i++) {
        galleryImages[i].classList.remove('gallery-hidden');
    }
    
    // Update pagination controls
    const prevBtn = document.getElementById('galleryPrev');
    const nextBtn = document.getElementById('galleryNext');
    const pageInfo = document.getElementById('galleryPageInfo');
    
    if (prevBtn) prevBtn.disabled = page === 1;
    if (nextBtn) nextBtn.disabled = page === totalPages;
    if (pageInfo) pageInfo.textContent = `${page} / ${totalPages}`;
}

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
    
    // ========================================
    // INITIALIZE BLOG
    // ========================================
    renderBlogPosts(1);
    
    // Blog load more button
    const blogLoadMore = document.getElementById('blogLoadMore');
    if (blogLoadMore) {
        blogLoadMore.addEventListener('click', (e) => {
            e.preventDefault();
            currentBlogPage++;
            renderBlogPosts(currentBlogPage);
        });
    }
    
    // Blog post modal handlers
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('blog-read-more')) {
            e.preventDefault();
            const postId = e.target.dataset.postId;
            openBlogPost(postId);
        }
    });
    
    const blogModalClose = document.getElementById('blogModalClose');
    if (blogModalClose) {
        blogModalClose.addEventListener('click', closeBlogPost);
    }
    
    const blogModal = document.getElementById('blogModal');
    if (blogModal) {
        blogModal.addEventListener('click', (e) => {
            if (e.target === blogModal) {
                closeBlogPost();
            }
        });
        
        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && blogModal.classList.contains('active')) {
                closeBlogPost();
            }
        });
    }
    
    // ========================================
    // INITIALIZE ZIP CODE CHECKER
    // ========================================
    const zipForm = document.getElementById('zipCheckForm');
    if (zipForm) {
        zipForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const zipInput = document.getElementById('zipCodeInput');
            if (zipInput) {
                checkZipCode(zipInput.value);
            }
        });
    }
    
    // ========================================
    // INITIALIZE NEWSLETTER
    // ========================================
    const newsletterForm = document.getElementById('newsletterForm');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('newsletterEmail');
            if (emailInput) {
                subscribeNewsletter(emailInput.value);
            }
        });
    }
    
    // Newsletter modal handlers
    const newsletterBtn = document.getElementById('openNewsletterModal');
    const newsletterModal = document.getElementById('newsletterModal');
    const newsletterModalClose = document.getElementById('newsletterModalClose');
    const newsletterModalForm = document.getElementById('newsletterModalForm');
    
    if (newsletterBtn && newsletterModal) {
        newsletterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            newsletterModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Set focus to email input
            requestAnimationFrame(() => {
                const emailField = newsletterModal.querySelector('input[type="email"]');
                emailField && emailField.focus();
            });
        });
    }
    
    // Handle newsletter modal form submission
    if (newsletterModalForm) {
        newsletterModalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const emailField = document.getElementById('newsletterModalEmail');
            const resultArea = document.getElementById('newsletterModalResult');
            
            if (emailField && resultArea) {
                handleNewsletterSubmit(emailField.value, resultArea, newsletterModalForm);
            }
        });
    }
    
    if (newsletterModalClose && newsletterModal) {
        const closeNewsletterModal = () => {
            newsletterModal.classList.remove('active');
            document.body.style.overflow = '';
        };
        
        newsletterModalClose.addEventListener('click', closeNewsletterModal);
        
        newsletterModal.addEventListener('click', (e) => {
            if (e.target === newsletterModal) {
                closeNewsletterModal();
            }
        });
        
        // Keyboard escape handler
        document.addEventListener('keydown', (e) => {
            const isEscapeKey = e.key === 'Escape' || e.key === 'Esc';
            const modalIsVisible = newsletterModal.classList.contains('active');
            
            if (isEscapeKey && modalIsVisible) {
                closeNewsletterModal();
            }
        });
    }
    
    // ========================================
    // INITIALIZE LAYOUT TOGGLE
    // ========================================
    initLayoutToggle();
    
    // ========================================
    // INITIALIZE LAZY LOADING
    // ========================================
    initLazyLoading();
    
    // ========================================
    // INITIALIZE GALLERY PAGINATION
    // ========================================
    const galleryPrev = document.getElementById('galleryPrev');
    const galleryNext = document.getElementById('galleryNext');
    
    if (galleryPrev) {
        galleryPrev.addEventListener('click', () => {
            if (currentGalleryPage > 1) {
                currentGalleryPage--;
                renderGalleryPage(currentGalleryPage);
            }
        });
    }
    
    if (galleryNext) {
        galleryNext.addEventListener('click', () => {
            const galleryContainer = document.getElementById('showcaseGallery');
            if (galleryContainer) {
                const totalImages = galleryContainer.querySelectorAll('.showcase-image').length;
                const totalPages = Math.ceil(totalImages / itemsPerGalleryPage);
                if (currentGalleryPage < totalPages) {
                    currentGalleryPage++;
                    renderGalleryPage(currentGalleryPage);
                }
            }
        });
    }
    
    // Initialize gallery if it exists
    if (document.getElementById('showcaseGallery')) {
        renderGalleryPage(1);
    }
    
    console.log('Friendly Telegram website loaded successfully!');
});
