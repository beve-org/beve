# BEVE GitHub Pages Website

This directory contains the GitHub Pages website for the BEVE specification.

## Enabling GitHub Pages

To enable GitHub Pages for this repository:

1. Go to your repository on GitHub
2. Click on **Settings**
3. Scroll down to the **Pages** section in the left sidebar
4. Under **Source**, select **Deploy from a branch**
5. Under **Branch**, select **main** (or your default branch) and **`/docs`** folder
6. Click **Save**

GitHub will automatically build and deploy your site. After a few minutes, your site will be available at:
```
https://<username>.github.io/<repository-name>/
```

For the BEVE repository, it should be:
```
https://beve-org.github.io/beve/
```

## Local Development

To preview the site locally:

1. Simply open `docs/index.html` in your web browser, or
2. Use a local web server:
   ```bash
   cd docs
   python3 -m http.server 8000
   ```
   Then visit `http://localhost:8000` in your browser.

## Site Structure

- `index.html` - Main specification page
- `implementations.html` - Implementation guides and links
- `proposals.html` - Extension proposals and working drafts
- `css/style.css` - Stylesheet for all pages
- `css/` - Additional CSS files
- `js/` - JavaScript files (if needed in the future)

## Updating the Site

To update the website:

1. Edit the HTML files in the `docs/` directory
2. Commit and push your changes to the main branch
3. GitHub Pages will automatically rebuild and deploy the site

## External Dependencies

The site uses the following CDN resources:
- **Highlight.js** (v11.9.0) - For syntax highlighting of code blocks
  - CSS: `github-dark.min.css`
  - JS: `highlight.min.js`

These are loaded from CDN and don't require local installation.

## Custom Domain (Optional)

To use a custom domain:

1. Add a file named `CNAME` to the `docs/` directory
2. Put your custom domain in the file (e.g., `beve.dev`)
3. Configure your DNS settings to point to GitHub Pages
4. GitHub will automatically serve your site from the custom domain

For more information, see: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site

## License

The website content is part of the BEVE project and is licensed under the MIT License.
