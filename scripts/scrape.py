#!/usr/bin/env python3
import os
import sys
import psutil
import asyncio
import hashlib
import argparse
import json # Added for JSON output
from typing import List, Tuple, Dict, Any # Added Any
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
import re
import requests
import xml.etree.ElementTree as ElementTree
from urllib.parse import urlparse
from collections import defaultdict
from rich.console import Console
import time  # Add time module
import aiohttp
from bs4 import BeautifulSoup
import ssl
import random

# Evitar problemas de SSL
ssl._create_default_https_context = ssl._create_unverified_context

# --- SSE Handling ---
# Function to safely print SSE data to stdout
def send_sse_message(event_type: str, data: Any):
    """Formats and prints data as a Server-Sent Event message."""
    try:
        # Convert data to JSON string if it's a dict or list
        if isinstance(data, (dict, list)):
            data_str = json.dumps(data)
        else:
            data_str = str(data)
        # Basic sanitization: remove newlines within the data
        data_str = data_str.replace('\\n', ' ').replace('\\r', '')
        print(f"SSE_DATA:{event_type}:{data_str}", flush=True)
    except Exception as e:
        # Fallback for unexpected errors during SSE formatting/printing
        print(f"SSE_DATA:ERROR:Failed to send SSE message ({event_type}): {e}", flush=True)


# Initialize rich console for stderr logging only
console = Console(stderr=True) # Send rich output to stderr

# --- Progress saving ---
class ProgressTracker:
    def __init__(self, session_id=None):
        self.session_id = session_id or f"session_{int(time.time())}"
        self.found_urls = set()
        self.processed_urls = set()
        self.success_count = 0
        self.fail_count = 0
        self.start_time = time.time()
        
    def add_url(self, url):
        self.found_urls.add(url)
        # Enviar evento al frontend
        self._send_sse("FOUND_URL", url)
        return len(self.found_urls)
    
    def add_success(self, url, title, preview="", email="", address=""):
        self.processed_urls.add(url)
        self.success_count += 1
        # Enviar evento al frontend
        data = {
            "url": url,
            "title": title,
            "preview": preview,
            "email": email,
            "address": address,
            "time": round(time.time() - self.start_time, 2)
        }
        self._send_sse("SUCCESS", json.dumps(data))
        
    def add_fail(self, url, error):
        self.processed_urls.add(url)
        self.fail_count += 1
        # Enviar evento al frontend
        data = {
            "url": url,
            "error": error,
            "time": round(time.time() - self.start_time, 2)
        }
        self._send_sse("FAIL", json.dumps(data))
        
    def status_message(self, msg):
        # Enviar estado al frontend
        self._send_sse("STATUS", msg)
        
    def _send_sse(self, event_type, data):
        print(f"SSE_DATA:{event_type}:{data}", flush=True)

# --- Signal Handling ---
import signal
import threading

stop_event = threading.Event() # Use an event to signal shutdown

def handle_sigterm(signum, frame):
    global stop_event
    console.print("[bold yellow]SIGTERM received, initiating graceful shutdown...[/]")
    stop_event.set()
    # Note: Further cleanup might be needed depending on crawler state

signal.signal(signal.SIGTERM, handle_sigterm)
# --- End Signal Handling ---


async def fetch_url_content(url: str) -> bytes | None:
    """Asynchronously fetches content from a URL."""
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, requests.get, url, {"timeout": 10})
        response.raise_for_status()
        return response.content
    except requests.RequestException as e:
        console.print(f"[yellow]Warning:[/] Failed to fetch {url}: {e}")
        return None


async def get_all_urls_from_sitemap(initial_sitemap_url: str) -> List[str]:
    """
    Recursively fetches and parses sitemaps (XML) to extract all non-sitemap URLs,
    sending FOUND_URL events via SSE.
    """
    all_final_urls = set()
    sitemaps_to_process = [initial_sitemap_url]
    processed_sitemaps = set()
    namespace = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    url_count = 0

    send_sse_message("STATUS", f"Starting sitemap processing: {initial_sitemap_url}")

    while sitemaps_to_process:
        if stop_event.is_set():
             send_sse_message("CANCELLED", "Sitemap processing stopped by signal.")
             return list(all_final_urls) # Return what was found so far

        current_sitemap_url = sitemaps_to_process.pop(0)
        if current_sitemap_url in processed_sitemaps:
            continue

        send_sse_message("STATUS", f"Processing sitemap: {current_sitemap_url}")
        processed_sitemaps.add(current_sitemap_url)

        content = await fetch_url_content(current_sitemap_url)
        if not content:
            send_sse_message("WARN", f"Failed to fetch content for sitemap: {current_sitemap_url}")
            continue # Skip if fetch failed

        try:
            root = ElementTree.fromstring(content)
            tag_suffix = root.tag.split('}')[-1] # Handle namespace prefixes

            if tag_suffix == "sitemapindex":
                sitemap_locs = [loc.text for loc in root.findall(".//ns:loc", namespace)]
                send_sse_message("STATUS", f"Found {len(sitemap_locs)} nested sitemaps in {current_sitemap_url}")
                for loc in sitemap_locs:
                    if loc not in processed_sitemaps and loc not in sitemaps_to_process:
                        sitemaps_to_process.append(loc)
            elif tag_suffix == "urlset":
                url_locs = [loc.text for loc in root.findall(".//ns:loc", namespace)]
                initial_count = len(all_final_urls)
                for loc in url_locs:
                    if loc.lower().endswith(".xml"): # It's another sitemap
                        if loc not in processed_sitemaps and loc not in sitemaps_to_process:
                             send_sse_message("STATUS", f"Found nested sitemap: {loc}")
                             sitemaps_to_process.append(loc)
                    else: # It's a final URL
                        final_url = loc # Renombrar para claridad
                        if final_url not in all_final_urls:
                             all_final_urls.add(final_url)
                             url_count += 1
                             # Imprimir para SSE
                             send_sse_message("FOUND_URL", final_url)
                added_count = len(all_final_urls) - initial_count
                if added_count > 0:
                     send_sse_message("STATUS", f"Added {added_count} URLs from {current_sitemap_url}. Total found: {url_count}")

            else:
                 send_sse_message("WARN", f"Unknown root tag '{root.tag}' in {current_sitemap_url}")

        except ElementTree.ParseError as e:
            send_sse_message("ERROR", f"Failed to parse XML from {current_sitemap_url}: {e}")
        except Exception as e:
            send_sse_message("ERROR", f"Unexpected error processing {current_sitemap_url}: {e}")

    send_sse_message("STATUS", f"Sitemap processing finished. Found {len(all_final_urls)} unique URLs.")
    return list(all_final_urls)


def get_sitemap_url(site_url):
    if not site_url.startswith(('http://', 'https://')):
        site_url = 'https://' + site_url # Default to https
    if site_url.endswith('/'):
        site_url = site_url[:-1]
    return f"{site_url}/sitemap.xml"


# FileOrganizer is kept for local saving logic if enabled, but structure preview is removed
class FileOrganizer:
    def __init__(self):
        self.used_names: Dict[str, Dict[str, str]] = defaultdict(dict)

    def clean_filename(self, name: str) -> str:
        name = re.sub(r"[^\w\-]", " ", name)
        name = re.sub(r"\s+", " ", name)
        name = name.strip().title()
        name = name.replace(" ", "_")
        return name

    def organize_path(self, url: str) -> Tuple[str, str]:
        parsed = urlparse(url)
        path_parts = [p for p in parsed.path.split("/") if p]

        if not path_parts:
            return "", "index.md"

        directory_parts = []
        for part in path_parts[:-1]:
            clean_part = self.clean_filename(part)
            if clean_part:
                directory_parts.append(clean_part)

        directory_path = os.path.join(*directory_parts) if directory_parts else ""

        filename_base = self.clean_filename(path_parts[-1]) if path_parts else "index"
        if not filename_base: filename_base = "index"

        filename = f"{filename_base}.md"

        # Simplified collision handling for SSE - focus is on scraping, not perfect local files
        if filename in self.used_names[directory_path]:
             if url != self.used_names[directory_path][filename]:
                 # Add a simple hash to differentiate
                 url_hash = hashlib.md5(url.encode()).hexdigest()[:6]
                 filename = f"{filename_base}_{url_hash}.md"

        self.used_names[directory_path][filename] = url
        return directory_path, filename

# Removed preview_file_structure as it relies on Rich Tree


class MemoryMonitor:
    def __init__(self, verbosity: int = 0):
        self.verbose = verbosity >= 3
        self.peak_memory = 0
        try:
            self.process = psutil.Process(os.getpid())
        except psutil.NoSuchProcess:
            self.process = None # Handle cases where process might not exist (rare)
            console.print("[red]Error:[/] Could not get current process for memory monitoring.")


    def log(self, prefix: str = ""):
        if not self.verbose or not self.process: return
        try:
            current_mem = self.process.memory_info().rss
            if current_mem > self.peak_memory: self.peak_memory = current_mem
            # Log memory usage to stderr to avoid polluting stdout for SSE
            console.print(
                f"[bold cyan]{prefix}[/] Current Memory: [green]{current_mem // (1024 * 1024)} MB[/], "
                f"Peak: [yellow]{self.peak_memory // (1024 * 1024)} MB[/]"
            )
        except psutil.NoSuchProcess:
             console.print("[red]Error:[/] Process disappeared during memory monitoring.")
             self.process = None # Stop trying


    def get_peak_memory_mb(self) -> int | None:
        if not self.process: return None
        return self.peak_memory // (1024 * 1024)


async def crawl_parallel(
    output_dir: str,
    urls: List[str],
    max_concurrent: int = 3,
    verbosity: int = 0,
    save_files: bool = False,
    session_id: str = None
) -> Dict[str, Any]:

    if save_files:
        console.print(f"[bold blue]Parallel Scraping Outputting to:[/] {output_dir}")
        os.makedirs(output_dir, exist_ok=True)

    # Create progress tracker
    if not session_id:
        session_id = f"session_{int(time.time())}"
    progress = ProgressTracker(session_id)
    
    file_organizer = FileOrganizer()
    memory_monitor = MemoryMonitor(verbosity=verbosity)
    results_data = {"success": [], "failed": [], "errors": [], "summary": {}} # Init summary
    processed_count = 0
    task_count = len(urls)
    
    # Restore progress for URLs that were already processed
    already_processed = [url for url in urls if progress.was_processed(url)]
    unprocessed_urls = [url for url in urls if not progress.was_processed(url)]
    
    if already_processed:
        send_sse_message("STATUS", f"Restoring progress: {len(already_processed)} URLs already processed")
        stats = progress.get_stats()
        send_sse_message("RESTORE_PROGRESS", {
            "already_processed": len(already_processed),
            "success": stats["success_count"],
            "failed": stats["failure_count"]
        })
        
        # Report previously successful URLs to frontend
        for url in progress.success_urls:
            send_sse_message("SUCCESS", {"url": url, "title": "Restored from checkpoint", "status": "restored"})
        
        # Report previously failed URLs to frontend
        for url in progress.failed_urls:
            send_sse_message("FAIL", {"url": url, "error": "Failed in previous run", "status": "restored"})
    
    # If everything was already processed, we're done
    if not unprocessed_urls:
        send_sse_message("STATUS", "All URLs were already processed in a previous run")
        send_sse_message("SUMMARY", {
            "total_urls_input": len(urls),
            "successful_scrapes": progress.get_stats()["success_count"],
            "failed_scrapes": progress.get_stats()["failure_count"],
            "restored_from_checkpoint": True
        })
        send_sse_message("END", "All URLs were previously processed")
        return results_data
        
    urls = unprocessed_urls
    task_count = len(urls)
    send_sse_message("STATUS", f"Starting parallel crawl of {task_count} unprocessed URLs...")

    browser_config = BrowserConfig(
        headless=True,
        verbose=verbosity >= 2, # Verbose browser logs to stderr
        extra_args=["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"],
    )
    crawl_config = CrawlerRunConfig(cache_mode=CacheMode.BYPASS)

    crawler = None # Initialize crawler variable
    try:
        crawler = AsyncWebCrawler(config=browser_config)
        await crawler.start()
        send_sse_message("STATUS", "Browser crawler started.")

        # Process URLs in smaller batches to save progress more frequently
        batch_size = min(max_concurrent * 2, 10)  # Process 10 URLs at a time max
        
        for i in range(0, task_count, batch_size):
            # --- Check for cancellation signal ---
            if stop_event.is_set():
                send_sse_message("CANCELLED", "Crawling stopped by signal.")
                # Save progress before exit
                progress.save_progress()
                break # Exit the main processing loop
            # --- End Check ---

            batch = urls[i : i + batch_size]
            tasks = []

            for j, url in enumerate(batch):
                session_id = f"parallel_session_{i + j}"
                crawl_task = crawler.arun(
                    url=url, config=crawl_config, session_id=session_id
                )
                tasks.append((url, crawl_task))

            try:
                memory_monitor.log(prefix="→")
                send_sse_message("STATUS", f"Processing batch {i//batch_size + 1}/{(task_count+batch_size-1)//batch_size}: {len(batch)} URLs...")
                batch_results = await asyncio.gather(*(task for _, task in tasks), return_exceptions=True)
                memory_monitor.log(prefix="←")

                for (url, _), result in zip(tasks, batch_results):
                    processed_count += 1
                    # Send detailed status update
                    current_time = time.strftime("%H:%M:%S")
                    send_sse_message("STATUS", f"Processed {processed_count}/{task_count}: {url} at {current_time}")

                    if isinstance(result, Exception):
                        error_message = f"Error scraping {url}: {str(result)}"
                        # Send failure details via SSE with more info
                        send_sse_message("FAIL", {
                            "url": url, 
                            "error": str(result),
                            "time": current_time,
                            "status": "error"
                        })
                        results_data["failed"].append(url)
                        results_data["errors"].append({"url": url, "error": str(result)})
                        progress.add_fail(url, str(result))
                    elif result.success:
                        # Extract content info for better reporting
                        content_preview = result.markdown[:100] + "..." if result.markdown and len(result.markdown) > 100 else "No content"
                        page_title = result.metadata.get('title', 'No title')
                        
                        # Send success details via SSE with more info
                        send_sse_message("SUCCESS", {
                            "url": url, 
                            "title": page_title,
                            "preview": content_preview,
                            "time": current_time,
                            "status": "success"
                        })
                        result_info = {
                            "url": url,
                            "title": page_title,
                            "markdown_preview": content_preview
                        }
                        results_data["success"].append(result_info)
                        progress.add_success(url, page_title, content_preview)

                        if save_files:
                            subdir, filename = file_organizer.organize_path(url)
                            full_dir = os.path.join(output_dir, subdir)
                            os.makedirs(full_dir, exist_ok=True)
                            file_path = os.path.join(full_dir, filename)
                            if verbosity >= 1: console.print(f"[green]✓[/] Writing: [bold]{file_path}[/]")
                            try:
                                with open(file_path, "w", encoding="utf-8") as f:
                                    f.write(result.markdown)
                                    
                                # También guardar metadata en un archivo JSON para facilitar el acceso
                                meta_path = os.path.join(full_dir, f"{os.path.splitext(filename)[0]}_meta.json")
                                with open(meta_path, "w", encoding="utf-8") as f:
                                    json.dump({
                                        "url": url,
                                        "title": page_title,
                                        "scrape_time": current_time,
                                        "metadata": result.metadata,
                                        "session_id": session_id
                                    }, f, indent=2)
                                    
                            except Exception as write_e:
                                error_message = f"Error writing file for {url}: {write_e}"
                                send_sse_message("ERROR", {"url": url, "error": error_message}) # Send write error
                                if url not in results_data["failed"]:
                                    results_data["failed"].append(url)
                                results_data["errors"].append({"url": url, "error": error_message})
                                progress.add_fail(url, error_message)

                    else:
                        error_message = f"Failed to scrape {url} - No content"
                        send_sse_message("FAIL", {
                            "url": url, 
                            "error": "Scraping failed, no content returned",
                            "time": current_time,
                            "status": "no_content"
                        })
                        results_data["failed"].append(url)
                        results_data["errors"].append({"url": url, "error": error_message})
                        progress.add_fail(url, error_message)

                # Save progress after each batch
                progress.save_progress()

            except Exception as batch_e:
                # Handle errors during asyncio.gather or within the batch loop itself
                error_message = f"Error processing batch starting with {batch[0]}: {str(batch_e)}"
                send_sse_message("ERROR", {"url": "batch_error", "error": error_message})
                # Mark URLs in this batch as failed if possible, otherwise just log the batch error
                for url, _ in tasks:
                    if url not in results_data["failed"]:
                        results_data["failed"].append(url)
                        progress.add_fail(url, f"Batch error: {str(batch_e)}")
                results_data["errors"].append({"url": "batch_error", "error": error_message})

            # Send periodic progress updates
            stats = progress.get_stats()
            send_sse_message("PROGRESS_UPDATE", {
                "processed": processed_count,
                "total": task_count,
                "success": stats["success_count"],
                "failed": stats["failure_count"],
                "percent_complete": round((processed_count / task_count) * 100, 1)
            })

    except Exception as e:
        # Catch critical errors like crawler failing to start
        error_msg = f"Critical error during scraping: {str(e)}"
        send_sse_message("ERROR", {"url": "critical_error", "error": error_msg})
        results_data["errors"].append({"url": "critical_error", "error": str(e)})

    finally:
        # Final save before cleanup
        progress.save_progress()
        
        if crawler:
            send_sse_message("STATUS", "Closing browser crawler...")
            await crawler.close()
            send_sse_message("STATUS", "Browser crawler closed.")
        else:
            send_sse_message("STATUS", "Crawler was not initialized.")

    # Include all processed URLs, including those from previous runs
    stats = progress.get_stats()
    
    # Calculate and send final summary
    results_data["summary"] = {
        "total_urls_input": len(urls) + len(already_processed),
        "successful_scrapes": stats["success_count"],
        "failed_scrapes": stats["failure_count"],
        "restored_from_checkpoint": len(already_processed) > 0,
        "peak_memory_mb": memory_monitor.get_peak_memory_mb() if verbosity >=3 else None
    }
    send_sse_message("SUMMARY", results_data["summary"])

    # Send final completion or cancellation message
    if stop_event.is_set():
        send_sse_message("END", "Scraping process cancelled, but progress was saved.")
    else:
        send_sse_message("END", "Scraping process finished normally.")

    # Return the final data structure (might still be useful for direct calls)
    return results_data


async def main(
    site_url: str,
    max_concurrent: int,
    verbosity: int,
    dry_run: bool = False, # Dry run is less useful with SSE, consider removing or adapting
    output_format: str = 'sse', # Default to SSE-focused output
    session_id: str = None
):
    # Keep console for stderr logging
    console = Console(stderr=True)

    if not session_id:
        session_id = f"session_{int(time.time())}"
        
    send_sse_message("START", {
        "url": site_url,
        "session_id": session_id,
        "max_concurrent": max_concurrent,
        "timestamp": time.time()
    })

    if output_format != 'sse': # Fallback or other modes if needed later
        console.print(f"\n[bold blue]🌐 Starting scraper for:[/] [bold]{site_url}[/]\n")

    if site_url.lower().endswith('.xml'):
        initial_sitemap_url = site_url
        parsed_uri = urlparse(site_url)
        domain_for_folder = parsed_uri.netloc or "local_output" # Handle cases without netloc
    else:
        initial_sitemap_url = get_sitemap_url(site_url)
        try:
            domain_for_folder = urlparse(site_url).netloc or urlparse(initial_sitemap_url).netloc or "local_output"
        except Exception:
            domain_for_folder = "local_output"

    # Get all URLs, sending FOUND_URL events during the process
    all_urls = await get_all_urls_from_sitemap(initial_sitemap_url)

    if not all_urls:
        send_sse_message("WARN", "No URLs found in sitemap(s), attempting to scrape the top-level URL only.")
        parsed_root = urlparse(site_url)
        scheme = parsed_root.scheme if parsed_root.scheme else 'https'
        netloc = parsed_root.netloc if parsed_root.netloc else parsed_root.path
        root_url = f"{scheme}://{netloc}/"
        if not netloc: # Handle case where site_url was just domain.com
             root_url = f"{scheme}://{site_url}/"

        # Validate the derived root_url before adding
        try:
            parsed_check = urlparse(root_url)
            if parsed_check.scheme and parsed_check.netloc:
                urls_to_process = [root_url]
                send_sse_message("FOUND_URL", root_url) # Send the single URL
            else:
                 send_sse_message("ERROR", f"Could not derive a valid root URL from input: {site_url}")
                 urls_to_process = []
        except Exception as e:
             send_sse_message("ERROR", f"Error parsing derived root URL '{root_url}': {e}")
             urls_to_process = []

    else:
        # URLs already sent via FOUND_URL during sitemap processing
        # Filter out potentially invalid URLs before processing (basic check)
        valid_urls = []
        for url in all_urls:
            try:
                parsed = urlparse(url)
                if parsed.scheme and parsed.netloc:
                    valid_urls.append(url)
                else:
                    send_sse_message("WARN", f"Skipping invalid URL from sitemap: {url}")
            except Exception as e:
                send_sse_message("WARN", f"Could not parse URL '{url}' from sitemap: {e}")
        urls_to_process = sorted(list(set(valid_urls))) # Ensure uniqueness and sort
        send_sse_message("STATUS", f"Prepared {len(urls_to_process)} unique valid URLs for scraping.")


    if not urls_to_process:
         send_sse_message("ERROR", "No valid URLs found to process.")
         send_sse_message("END", "Scraping process aborted.")
         # Optionally: exit here if no URLs? sys.exit(1)
         return # Return early

    # Output directory logic remains for potential file saving
    output_folder = os.path.join(os.getcwd(), domain_for_folder)

    # Dry run might just list found URLs and exit?
    if dry_run:
        send_sse_message("STATUS", "[Dry Run] Would process the following URLs:")
        for url in urls_to_process:
             send_sse_message("DRY_RUN_URL", url)
        send_sse_message("STATUS", "[Dry Run] Completed. No scraping performed.")
        send_sse_message("END", "[Dry Run] Finished.")
        return

    # Determine if files should be saved (only relevant if not solely relying on SSE)
    # Set save_files based on output_format or another flag if needed
    save_files_locally = output_format in ['files', 'both'] # Example: Add a 'files' output format

    # Perform the crawl - progress is sent via SSE messages from within the function
    # The final returned 'results' might be less important if frontend consumes SSE
    results = await crawl_parallel(
        output_folder,
        urls_to_process,
        max_concurrent=max_concurrent,
        verbosity=verbosity,
        save_files=save_files_locally,
        session_id=session_id
    )

    # Final summary/end messages are sent from within crawl_parallel


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract business data from websites and send events via SSE")
    parser.add_argument("--sitemap", "-s", help="URL of the sitemap or website (will try to find sitemap.xml)")
    parser.add_argument("--max_concurrent", "-c", type=int, default=3, help="Maximum number of concurrent requests")
    parser.add_argument("--verbose", "-v", action="count", default=0, help="Increase verbosity")
    parser.add_argument("--sse", action="store_true", help="Enable SSE output mode")
    parser.add_argument("--output_dir", "-o", default="./data", help="Output directory for saved data")
    parser.add_argument("--output_format", choices=["json", "md", "sse"], default="sse", help="Output format")

    args = parser.parse_args()

    # Asegurar que tenemos una URL del sitemap
    if not args.sitemap:
        send_sse_message("ERROR", "No sitemap URL provided")
        sys.exit(1)

    # Log de inicio para depuración
    send_sse_message("STATUS", f"Starting extraction with sitemap URL: {args.sitemap}")

    # Configurar el sitemap_url
    sitemap_url = args.sitemap
    if not sitemap_url.startswith(('http://', 'https://')):
        sitemap_url = 'https://' + sitemap_url
    
    # Comprobar si la URL apunta directamente a un sitemap XML
    if not sitemap_url.endswith('.xml'):
        sitemap_url = get_sitemap_url(sitemap_url)
    
    send_sse_message("STATUS", f"Using sitemap URL: {sitemap_url}")
    
    try:
        asyncio.run(main(
            site_url=sitemap_url,
            max_concurrent=args.max_concurrent,
            verbosity=args.verbose,
            output_format="sse"  # Forzar formato SSE
        ))
        # Enviar evento de finalización
        send_sse_message("STATUS", "Extraction completed successfully")
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        send_sse_message("ERROR", f"Fatal error during extraction: {str(e)}")
        console.print(f"[bold red]ERROR:[/] {error_details}", file=sys.stderr)
        sys.exit(1)