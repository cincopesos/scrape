# Web Scraper

A high-performance parallel web scraper that converts websites into organized Markdown files. Built with Python and `crawl4ai`, `requests`, `psutil`, `rich`, and `asyncio`, this tool efficiently processes websites by leveraging their sitemaps and supports concurrent scraping with built-in memory monitoring.

## Features

- 🚀 Parallel scraping with configurable concurrency
- 📑 Automatic sitemap detection and processing
- 📁 Organized output with clean directory structure
- 💾 Memory-efficient with built-in monitoring
- 🌐 Browser-based scraping using crawl4ai
- 📊 Progress tracking and detailed logging
- 🔍 Preview mode with dry-run option

## Requirements

- Python 3.7+
- crawl4ai
- rich
- psutil
- requests

## Installation

1. Clone the repository:

```bash
git clone https://github.com/rkabrick/scrape.git
cd web-scraper
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

## Usage

Basic usage:

```bash
python scrape https://example.com
```

### Command Line Options

```bash
scrape [-h] [--max-concurrent MAX_CONCURRENT] [-v] [--dry-run] url
```

Arguments:

- `url`: The target URL to scrape (must include http:// or https://)
- `--max-concurrent`: Maximum number of concurrent scrapers (default: 3)
- `-v`: Increase verbosity level
  - `-v`: Show file names
  - `-vv`: Show browser output
  - `-vvv`: Show memory monitoring
- `--dry-run`: Preview the file structure without performing the scrape

### Examples

1. Basic scraping:

```bash
scrape https://example.com
```

2. Scraping with increased concurrency:

```bash
scrape --max-concurrent 5 https://example.com
```

3. Preview mode with file structure:

```bash
scrape --dry-run https://example.com
```

4. Verbose output with memory monitoring:

```bash
scrape -vvv https://example.com
```

## Output Structure

The scraper creates an organized directory structure based on the website's URL paths. For example:

```
example.com/
├── index.md
├── about/
│   └── index.md
├── blog/
│   ├── post1.md
│   └── post2.md
└── products/
    ├── category1/
    │   └── item1.md
    └── category2/
        └── item2.md
```

## Features in Detail

### Sitemap Processing

- Automatically detects and processes XML sitemaps
- Falls back to single URL processing if no sitemap is found
- Supports both simple and nested sitemap structures

### Memory Management

- Built-in memory monitoring for resource-intensive operations
- Configurable concurrent scraping to balance performance and resource usage
- Automatic cleanup of browser instances

### File Organization

- Intelligent path handling and file naming
- Duplicate file name resolution
- Clean, SEO-friendly file structure
- Markdown output for compatibility

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [crawl4ai](https://github.com/example/crawl4ai) for reliable web scraping
- Uses [rich](https://github.com/Textualize/rich) for beautiful terminal output
- Memory monitoring powered by [psutil](https://github.com/giampaolo/psutil)

## Support

For issues, questions, or contributions, please open an issue in the GitHub repository.
