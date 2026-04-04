# AM Mowing - Frontend

A modern static multi-page website for AM Mowing professional lawn care services.

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
├── index.html         # Home page
├── services.html      # Services page
├── insights.html      # Insights page
├── about.html         # About page
├── service-area.html  # Service area page (Leaflet map)
├── process.html       # Property evaluation process page
├── contact.html       # Contact page with form
├── styles.css         # Shared styling with animations
└── script.js          # Shared interactive behaviors
```

## Quick Start

### Recommended: Local Dev with Vercel CLI

The site uses `vercel.json` rewrite rules to map clean URLs (e.g. `/`, `/about`) to the
HTML files in `frontend/`. A plain file server does **not** honour these rules, so assets
and pages may 404. Use the [Vercel CLI](https://vercel.com/docs/cli) instead:

```bash
# Install once (requires Node.js)
npm i -g vercel

# From the repository root
vercel dev
```

Then open `http://localhost:3000`. The rewrite rules in `vercel.json` are applied
automatically, so every clean URL resolves correctly.

### Alternative: Serve the Frontend Folder Directly

If you only need to browse the site and are happy to use `.html` file URLs, you can
serve the `frontend/` directory with any static server:

```bash
cd frontend
python3 -m http.server 8080
# Then open http://localhost:8080/index.html
```

> **Note:** With this approach the root `vercel.json` rewrites are **not** applied, so
> navigating to bare paths like `http://localhost:8080/about` will return a 404.  Always
> use `vercel dev` (above) for full URL routing support.

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

- **Home content**: Edit `index.html`
- **Service content**: Edit `services.html`
- **Insights content**: Edit `insights.html`
- **About and testimonials**: Edit `about.html`
- **Service area map page**: Edit `service-area.html`
- **Contact form page**: Edit `contact.html`

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
