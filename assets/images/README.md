# Images Folder

Drop your own lawn care photos here and update the references in the HTML files. The folder can hold as many images as you need — there is no limit imposed by the project.

## Currently referenced image slots

| File name / URL used | Where it appears | How to replace |
|---|---|---|
| `showcase-1.jpg` | `index.html` — Social Showcase gallery (slot 1) | Add `showcase-1.jpg` here; update the `<img src>` |
| `showcase-2.jpg` | `index.html` — Social Showcase gallery (slot 2) | Add `showcase-2.jpg` here; update the `<img src>` |
| `showcase-3.jpg` | `index.html` — Social Showcase gallery (slot 3) | Add `showcase-3.jpg` here; update the `<img src>` |
| Unsplash hero image | `index.html` — Hero background | Replace `src` in the `<img class="hero-image">` tag |
| Unsplash featured cards | `index.html` — Featured section (3 cards) | Replace each `<img src>` inside `.featured-image` |
| Unsplash about image | `index.html` & `about.html` — About section portrait | Replace `src` in `<div class="about-image"> img` |
| Unsplash insight images | `index.html` — Insights section (3 cards) | Replace each `<img src>` inside `.insight-image` |
| `lawn-craft.png` | All pages — Header logo | Drop your logo here as `lawn-craft.png` |

## Tips for adding your own photos

- **Format:** Use compressed JPEG (`.jpg`) or WebP for best page load performance.
- **Dimensions:** Aim for 800×600 px for cards, 1600×900 px for the hero image.
- **File names:** Stick to lowercase with hyphens, e.g. `project-before.jpg`.
- **HTML attributes:** Always add `width`, `height`, and `alt` attributes on every `<img>` tag for layout stability and accessibility.
- **Lazy loading:** Use `loading="lazy"` on any image that is below the fold (not visible on first load).

## Example — replacing Showcase slot 1

1. Copy your photo into this folder and name it `showcase-1.jpg`.
2. In `frontend/index.html`, find the first `.showcase-image` block and change the `src`:

```html
<img src="/assets/images/showcase-1.jpg" alt="Before and after lawn treatment at Karen property" loading="lazy">
```
