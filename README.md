# U Energy Dashboard

[![CI](https://github.com/moss-xxh/UEH----/actions/workflows/ci.yml/badge.svg)](https://github.com/moss-xxh/UEH----/actions/workflows/ci.yml)
[![Deploy](https://github.com/moss-xxh/UEH----/actions/workflows/deploy.yml/badge.svg)](https://github.com/moss-xxh/UEH----/actions/workflows/deploy.yml)

A modern energy management dashboard with real-time and historical data analysis.

## Features

- 🌐 **Multi-language Support**: Chinese and English
- 📊 **Real-time Analysis**: Live energy data monitoring
- 📈 **Historical Analysis**: Trend analysis and insights
- 🎨 **Modern UI**: Dark theme with responsive design
- 📱 **Mobile Friendly**: Fully responsive layout
- 🔔 **Notification System**: Real-time alerts and updates

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/moss-xxh/UEH----.git
   cd UEH----
   ```

2. Open `index.html` in your web browser or serve with a local server:
   ```bash
   python -m http.server 8000
   # or
   npx http-server
   ```

3. Navigate to `http://localhost:8000`

## GitHub Actions

This project uses GitHub Actions for continuous integration and deployment:

- **CI**: Runs on every push and pull request
  - HTML validation
  - JavaScript syntax checking
  - Code formatting checks
  - Security scanning

- **Deploy**: Automatically deploys to GitHub Pages when pushing to main branch

- **Release**: Creates releases automatically when pushing version tags

## Project Structure

```
├── index.html              # Main dashboard
├── profit-new.html         # Profit analysis page
├── family-new.html         # Family management page
├── analysis-new.html       # Analysis page
├── 001.html               # Combined analysis view
├── components/            # Reusable components
│   ├── header-nav.js     # Navigation component
│   ├── i18n.js           # Internationalization
│   └── ...
└── .github/workflows/     # GitHub Actions workflows
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. All rights reserved.