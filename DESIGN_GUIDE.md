# Design System - Kiroto Studios Inspired

## Overview
Your Lawn Craft website has been redesigned to match the aesthetic of Kiroto Studios (kirotostudios.com). This design emphasizes minimalism, intentional spacing, warm earthy tones, and clean typography inspired by African heritage and community-focused design.

---

## Color Palette

### Primary Colors
- **Navy Primary**: `#1a1a1a` - Deep charcoal for main text and headers
- **Warm Accent**: `#d4a574` - Earthy tan/bronze (replaces previous blue)
- **Secondary Accent**: `#8B6F47` - Warm brown tone

### Accents & Backgrounds
- **Accent Green**: `#6b8e6f` - Subtle green for secondary elements
- **Text Dark**: `#1a1a1a` - Main text color
- **Text Medium**: `#4a4a4a` - Secondary text
- **Text Light**: `#6b6b6b` - Tertiary/muted text
- **Background Light**: `#f5f3f0` - Warm off-white
- **Background Lighter**: `#faf8f6` - Subtle warm cream
- **Border Light**: `#e8e3dd` - Soft warm border

### Semantic Colors
- **Error**: `#dc3545` - Red for errors
- **Success**: `#28a745` - Green for success

---

## Typography

### Font Family
- **Primary**: Lato (already configured)
- **Fallback**: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif

### Font Sizes & Weights

#### Hero Section
- **Title**: 
  - Font Size: `clamp(2.5rem, 8vw, 4.5rem)` (responsive)
  - Font Weight: `900` (extra bold)
  - Letter Spacing: `-0.02em`

- **Subtitle**:
  - Font Size: `1.25rem`
  - Font Weight: `300` (light)
  - Line Height: `1.8`

#### Section Headers
- **Title**:
  - Font Size: `clamp(1.8rem, 5vw, 3.2rem)` (responsive)
  - Font Weight: `900`
  - Letter Spacing: `-0.02em`

- **Subtitle**:
  - Font Size: `1.05rem`
  - Font Weight: `300`

#### Body Text
- **Regular**: `0.95rem`, weight `400-500`, line height `1.7-1.9`

---

## Key Design Elements

### Hero Section
- **Full-width background image** with subtle overlay
- Overlay gradient: `135deg, rgba(212, 165, 116, 0.15) → rgba(107, 142, 111, 0.1)`
- Dark text on light background (NOT white text)
- Two CTA buttons: Primary (warm accent) + Secondary (outlined)

### Buttons
All buttons have been updated to use the warm accent color:

```css
.btn-primary {
    background: var(--accent-warm); /* #d4a574 */
    color: white;
}

.btn-secondary {
    background: transparent;
    color: var(--navy-primary);
    border: 2px solid var(--navy-primary);
}
```

### Cards & Sections
- **Minimal shadows**: `0 8px 24px rgba(0, 0, 0, 0.08)` (subtle)
- **Subtle borders**: 1px `var(--border-light)` instead of heavy shadows
- **Hover effects**: Slight lift (`translateY(-2px) or -4px`) + shadow increase
- **No border radius on buttons** - flat design inspired by Kiroto

### Service Cards
- **Left border**: 4px solid warm accent (instead of top border)
- **Number styling**: Large, transparent warm accent text
- **Feature bullets**: Chevron (›) instead of dots

### Testimonials
- **Top border**: 3px warm accent
- **Normal font style** (no italics)
- **Simple box styling** with light border

### Trust Indicators
- **Circular gradient backgrounds** for icons (warm → brown gradient)
- **Centered, clean layout**
- **No excessive decoration**

---

## Spacing & Layout

### Container
- Max-width: `1200px`
- Padding: `0 40px`

### Section Padding
- Standard: `6rem 0` (vertical)

### Grid Gaps
- Cards: `2.5rem - 3rem`
- Trust indicators: `3rem`

### Element Spacing
- Margins between text: Consistent `1rem - 1.5rem` gaps
- Button groups: `1.5rem` gap between buttons

---

## Responsive Breakpoints

1. **Desktop**: Full design (1024px+)
2. **Tablet** (768px - 1024px): 
   - 2-column grids adapt to single column
   - Reduced padding
3. **Mobile** (< 768px):
   - Single column layouts
   - Larger touch targets (44px minimum)
   - Adjusted typography sizes

---

## Animation & Transitions

- **Standard transition**: `all 0.3s ease`
- **Hover effects**: Subtle Y-axis transform + shadow
- **Scroll animations**: Fade-in on scroll (managed by JavaScript)

### Icon Animations
- FAQ chevron rotates 180° on expand
- Links have smooth color transitions

---

## Accessibility Features

1. **Focus states**: 2px solid outline with 2px offset
2. **Skip-to-content link**: Visible on focus
3. **ARIA labels** on interactive elements
4. **Proper heading hierarchy** (h1 → h4)
5. **Color contrast** meets WCAG AA standards
6. **Form validation** with error messages

---

## Updated Components

### Navigation Bar
- Clean, minimal design
- Warm accent on hover
- No heavy shadows
- Social icons optional

### Footer
- Dark navy background (`#1a1a1a`)
- Warm accent for footer tagline
- Clean link styling

### Contact Form
- Larger padding for better touch targets
- Warm accent border on focus
- Clear error/success states

---

## Key Changes from Previous Design

| Element | Before | After |
|---------|--------|-------|
| Primary Color | Blue (`#0066cc`) | Warm Tan (`#d4a574`) |
| Accent Color | Navy (`#001f3f`) | Deep Brown (`#8B6F47`) |
| Button Style | Rounded + heavy shadow | Sharp corners, minimal shadow |
| Service Cards | Top border | Left border |
| Text Style | More formal | Warmer, more intentional |
| Background | Light gray | Warm cream |
| Hero Text | White on dark | Dark on subtle overlay |
| Hover Effects | Large lift + big shadow | Gentle lift + subtle shadow |

---

## Implementation Checklist

- ✅ Color variables updated in CSS
- ✅ Typography scaled and weighted
- ✅ Navigation redesigned
- ✅ Hero section updated
- ✅ Card components simplified
- ✅ Button styles refreshed
- ✅ Spacing normalized
- ✅ Footer styled
- ✅ Form inputs enhanced
- ✅ Mobile responsiveness maintained
- ✅ Accessibility preserved

---

## Next Steps (Optional Enhancements)

1. **Images**: Replace placeholder images with actual lawn care project photos
2. **Logo**: Update "Lawn Craft" logo to match the warm color scheme
3. **Brand Photography**: Use warm-toned, natural lighting in images
4. **Additional Pages**: Create blog/insights pages with consistent styling
5. **Animation Library**: Consider adding subtle scroll animations using AOS or similar
6. **Dark Mode**: Optional dark mode variant following the same principles

---

## Design Philosophy

This redesign embodies Kiroto Studios' design principles:
- **Intentional**: Every element has purpose
- **Warm & Welcoming**: Earthy color palette creates community feeling
- **Clean & Minimal**: Removes unnecessary elements
- **Accessible**: Design works for everyone
- **Heritage-Inspired**: Warm, natural tones reflect connection to earth/nature
- **Scalable**: Responsive design that works on all devices

---

*Design Specifications Last Updated: February 18, 2026*
