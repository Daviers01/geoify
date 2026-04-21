# Geoify — Free Image Geotagging Tool

Embed GPS coordinates into JPEG EXIF metadata directly in your browser. No account, no server uploads, no watermarks.

**Live:** https://geoify.vercel.app/

## Features

- Embed GPS coordinates into JPEG EXIF metadata
- Click a map, use device GPS, or enter lat/lng manually
- Upload JPEG, PNG, WebP, GIF, or BMP — all exported as JPEG
- Set a custom filename per image
- Batch process multiple images at once
- Download individually or all at once
- 100% browser-based — images never leave your device

## How it works

1. Upload one or more images
2. Pin your location on the map (or type coordinates)
3. Optionally set a custom filename per image
4. Click **Geotag Images** and download

## Tech

- Vanilla JS, HTML, CSS
- [Leaflet](https://leafletjs.com/) for the interactive map
- [piexifjs](https://github.com/hMatoba/piexifjs) for EXIF embedding
- [Bootstrap 5](https://getbootstrap.com/) for layout
- Deployed on [Vercel](https://vercel.com/)

## Development

No build step. Open `index.html` directly or serve locally:

```bash
npx serve .
```
