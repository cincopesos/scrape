#!/usr/bin/env python3
import asyncio
import json
import os
import re
import signal
import sys
import time
import urllib.parse
import ssl
from typing import Dict, List, Set, Any, Optional, Tuple

import aiohttp
import argparse
from bs4 import BeautifulSoup
from rich.console import Console
from urllib.parse import urlparse, urljoin

# Initialize console for output
console = Console(stderr=True)

# Dictionary to store extracted business data
businesses_data = {}

# Exit flag for graceful shutdown
exit_flag = False


def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully."""
    global exit_flag
    console.print("[yellow]Interrupt received, finishing current tasks...[/]")
    exit_flag = True


signal.signal(signal.SIGINT, signal_handler)


def normalize_url(url: str) -> str:
    """Normalize URL to prevent duplicates."""
    parsed = urlparse(url)
    
    # Remove trailing slash
    path = parsed.path
    if path.endswith("/") and len(path) > 1:
        path = path[:-1]
        
    # Ensure scheme is set
    scheme = parsed.scheme or "https"
    
    # Rebuild URL without query params or fragments
    normalized = f"{scheme}://{parsed.netloc}{path}"
    return normalized


async def fetch_url(url: str, session: aiohttp.ClientSession, timeout: int = 30) -> Optional[str]:
    """Fetch URL content with error handling."""
    try:
        async with session.get(url, timeout=timeout, ssl=False) as response:
            if response.status == 200:
                return await response.text()
            else:
                console.print(f"[yellow]Warning:[/] {url} returned status {response.status}")
                return None
    except Exception as e:
        console.print(f"[yellow]Warning:[/] Failed to fetch {url}: {e}")
        return None


async def process_sitemap(sitemap_url: str, session: aiohttp.ClientSession) -> Set[str]:
    """Process a sitemap and extract URLs."""
    console.print(f"[cyan]Processing sitemap:[/] {sitemap_url}")
    
    content = await fetch_url(sitemap_url, session)
    if not content:
        return set()
    
    urls = set()
    soup = BeautifulSoup(content, 'xml')
    
    # Check if it's a sitemap index
    sitemap_tags = soup.find_all('sitemap')
    if sitemap_tags:
        # It's a sitemap index, process each sitemap
        for sitemap_tag in sitemap_tags:
            loc_tag = sitemap_tag.find('loc')
            if loc_tag and loc_tag.string:
                sub_sitemap_url = loc_tag.string.strip()
                if exit_flag:
                    break
                sub_urls = await process_sitemap(sub_sitemap_url, session)
                urls.update(sub_urls)
    else:
        # It's a regular sitemap, extract URLs
        url_tags = soup.find_all('url')
        for url_tag in url_tags:
            loc_tag = url_tag.find('loc')
            if loc_tag and loc_tag.string:
                page_url = loc_tag.string.strip()
                urls.add(page_url)
    
    return urls


def is_root_domain_url(url: str) -> bool:
    """Check if the URL is a root-level domain URL."""
    parsed = urlparse(url)
    # Consider it a root URL if the path is empty or just '/'
    return parsed.path == "" or parsed.path == "/"


def extract_root_urls(urls: Set[str]) -> Set[str]:
    """Extract only the root URLs for each domain/subdomain."""
    domains = {}
    
    for url in urls:
        parsed = urlparse(url)
        domain = parsed.netloc
        
        # If it's a root URL, use it directly
        if is_root_domain_url(url):
            domains[domain] = url
        # Otherwise, if we haven't seen this domain or we don't have a root URL yet
        elif domain not in domains:
            # Create a root URL for this domain
            scheme = parsed.scheme or "https"
            domains[domain] = f"{scheme}://{domain}/"
    
    return set(domains.values())


async def extract_business_info(url: str, session: aiohttp.ClientSession) -> Dict[str, Any]:
    """Extract business information from a URL."""
    console.print(f"[green]Extracting business info:[/] {url}")
    
    content = await fetch_url(url, session)
    if not content:
        return {
            "url": url,
            "status": "error",
            "error_message": "Failed to fetch content"
        }
    
    soup = BeautifulSoup(content, 'html.parser')
    
    # Extract basic info
    title = soup.title.string.strip() if soup.title else ""
    
    # Extract meta description
    description = ""
    meta_desc = soup.find('meta', attrs={'name': 'description'}) or soup.find('meta', attrs={'property': 'og:description'})
    if meta_desc and meta_desc.get('content'):
        description = meta_desc['content'].strip()
    
    # Extract address (common patterns)
    address = ""
    address_candidates = []
    
    # Look for address in elements with specific classes/IDs
    for selector in ['.address', '#address', '[itemprop="address"]', '.contact-info', '.location', '.footer']:
        elements = soup.select(selector)
        for element in elements:
            text = element.get_text().strip()
            if text and len(text) > 5 and len(text) < 200:  # Reasonable address length
                address_candidates.append(text)
    
    # Look for address patterns in the text
    if not address_candidates:
        # Try to find text with address-like patterns (like street, avenue, etc.)
        address_patterns = [
            r'\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl|Terrace|Ter)[\s,]+[A-Za-z\s]+(?:,\s*[A-Z]{2})?\s*\d{5}(?:-\d{4})?',
            r'(?:calle|av\.|avenida|carrera|autopista|paseo)\s+[A-Za-z0-9\s]+(?:,\s*[A-Za-z\s]+)?(?:,\s*[A-Za-z\s]+)?',
        ]
        
        for pattern in address_patterns:
            # Search in page content
            for match in re.finditer(pattern, content, re.IGNORECASE):
                address_candidates.append(match.group(0).strip())
                
    # Pick the best address candidate
    if address_candidates:
        # Sort by length (prefer longer addresses as they're more likely to be complete)
        address_candidates.sort(key=len, reverse=True)
        address = address_candidates[0]
    
    # Extract email addresses
    email = ""
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    emails = re.findall(email_pattern, content)
    if emails:
        email = emails[0]  # Take the first email found
    
    # Build and return business data
    business_data = {
        "url": url,
        "title": title,
        "description": description,
        "address": address,
        "email": email,
        "status": "processed"
    }
    
    return business_data


async def process_root_url(url: str, session: aiohttp.ClientSession, sitemap_url: str) -> Dict[str, Any]:
    """Process a root URL to extract business information."""
    normalized_url = normalize_url(url)
    
    # Skip if already processed
    if normalized_url in businesses_data:
        return businesses_data[normalized_url]
    
    # Extract business information
    business_data = await extract_business_info(normalized_url, session)
    business_data["sitemap_url"] = sitemap_url
    
    # Store in our dictionary
    businesses_data[normalized_url] = business_data
    
    return business_data


async def main(sitemap_url: str, max_concurrent: int = 5, output_file: str = None):
    """Main function to process sitemaps and extract business data."""
    start_time = time.time()
    console.print(f"[bold blue]Starting business data extraction from[/] [bold]{sitemap_url}[/]")
    
    # Create a SSL context that doesn't verify certificates
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    # Test the URL first to make sure it's accessible
    try:
        test_session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False))
        test_response = await test_session.get(sitemap_url, ssl=False)
        console.print(f"[green]Initial connection test successful, status code: {test_response.status}[/]")
        await test_session.close()
    except Exception as e:
        console.print(f"[red]Error testing URL connection: {e}[/]")
        # If you want to try a fallback approach, you can implement it here
            
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as session:
        # Step 1: Process the main sitemap to find all URLs
        all_urls = await process_sitemap(sitemap_url, session)
        console.print(f"[bold green]Found {len(all_urls)} URLs in total[/]")
        
        # Step 2: Extract root domains from all URLs
        root_urls = extract_root_urls(all_urls)
        console.print(f"[bold green]Identified {len(root_urls)} unique root domains[/]")
        
        # Step 3: Process each root URL to extract business information
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def process_with_semaphore(url):
            async with semaphore:
                if exit_flag:
                    return None
                return await process_root_url(url, session, sitemap_url)
        
        tasks = [process_with_semaphore(url) for url in root_urls]
        results = []
        
        total = len(tasks)
        completed = 0
        
        for future in asyncio.as_completed(tasks):
            result = await future
            if result:
                results.append(result)
            
            completed += 1
            if completed % 10 == 0 or completed == total:
                elapsed = time.time() - start_time
                per_item = elapsed / completed if completed > 0 else 0
                remaining = (total - completed) * per_item
                
                console.print(f"[bold]Progress:[/] {completed}/{total} ({completed/total*100:.1f}%) | " 
                              f"Elapsed: {elapsed:.1f}s | ETA: {remaining:.1f}s")
        
        console.print(f"[bold green]Completed processing {len(results)} businesses[/]")
        
        # Step 4: Save results
        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            console.print(f"[bold]Results saved to:[/] {output_file}")
        
        # Print summary
        success_count = sum(1 for r in results if r.get("status") == "processed")
        error_count = sum(1 for r in results if r.get("status") == "error")
        
        console.print("[bold]===============================")
        console.print(f"[bold]Total businesses processed:[/] {len(results)}")
        console.print(f"[bold green]Successfully processed:[/] {success_count}")
        console.print(f"[bold red]Failed to process:[/] {error_count}")
        console.print(f"[bold]Time taken:[/] {time.time() - start_time:.2f} seconds")
        console.print("[bold]===============================")
        
        return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract business data from sitemaps")
    parser.add_argument("sitemap_url", help="URL of the sitemap to process")
    parser.add_argument("--max-concurrent", type=int, default=5, help="Maximum number of concurrent requests")
    parser.add_argument("--output", help="Output file path (JSON format)")
    
    args = parser.parse_args()
    
    try:
        asyncio.run(main(args.sitemap_url, args.max_concurrent, args.output))
    except KeyboardInterrupt:
        console.print("[bold red]Process interrupted by user[/]")
        sys.exit(1)
    except Exception as e:
        console.print(f"[bold red]An error occurred:[/] {e}")
        sys.exit(1) 