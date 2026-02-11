# AM Mowing - Frontend

A beautiful, modern static website for AM Mowing professional lawn care services.

## Features

- **Modern Design**: Beautiful gradient hero section with smooth animations
- **Responsive Layout**: Mobile-first design that works on all devices  
- **Interactive Elements**: Smooth scrolling, hover effects, and dynamic animations
- **Contact Form**: Functional form with validation and success feedback
- **Service Showcase**: Detailed presentation of all lawn care services
- **Customer Testimonials**: Social proof with 5-star reviews
- **Performance Optimized**: Fast loading and smooth scroll performance

## Files Structure

```
frontend/
├── index.html    # Main HTML file with semantic markup
├── styles.css    # Complete styling with animations
└── script.js     # Interactive features and form handling
```

## Quick Start

### View Locally

Simply open `index.html` in a web browser to view the website.

### Development Server

For development with live reload:

```bash
cd frontend
python3 -m http.server 8080
```

Then navigate to `http://localhost:8080`

Alternatively, you can use any static file server:

```bash
# Using Node.js http-server
npx http-server -p 8080

# Using PHP
php -S localhost:8080
```

## Technologies Used

- **HTML5**: Semantic markup for better SEO and accessibility
- **CSS3**: Modern styling with CSS Grid, Flexbox, animations, and gradients
- **JavaScript (ES6+)**: Interactive features and form validation
- **Google Fonts**: Professional typography using Lato font family
- **Leaflet**: Interactive maps for service area visualization
- **Unsplash**: High-quality images

## Browser Support

The website is compatible with all modern browsers:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Integration with Backend

The frontend is designed to work with the FastAPI backend located in the `../backend` directory. 

To connect the frontend to the backend:

1. Update the API endpoint in `script.js`:
   ```javascript
   const API_BASE_URL = 'http://localhost:8000/api';
   ```

2. Start the backend server (see `../backend/README.md`)

3. The contact form and other interactive features will communicate with the backend API

## Customization

### Updating Content

- **Services**: Edit the services section in `index.html`
- **Testimonials**: Update testimonial cards in `index.html`
- **Contact Information**: Modify contact details in the footer

### Styling

- **Colors**: Update CSS variables in `styles.css` (`:root` section)
- **Fonts**: Change font family in the Google Fonts link and CSS
- **Layout**: Modify CSS Grid and Flexbox properties in `styles.css`

### Adding Features

- **New Sections**: Add HTML structure and corresponding CSS
- **Animations**: Use the existing animation classes or create new ones
- **Interactive Elements**: Add JavaScript functionality in `script.js`

## Performance

The website is optimized for performance:
- Preloaded critical assets (fonts, hero image)
- Optimized images from CDN
- Minimal JavaScript
- Efficient CSS with modern features
- Lazy loading for images

## License

© 2026 AM Mowing. All rights reserved.
