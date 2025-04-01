#!/usr/bin/env python3
import os
import sys
import asyncio
import argparse
import json
import requests
import xml.etree.ElementTree as ElementTree
from urllib.parse import urlparse
import time
from bs4 import BeautifulSoup
import ssl
import re

# Evitar problemas de SSL
ssl._create_default_https_context = ssl._create_unverified_context

# --- SSE Handling ---
def send_sse_message(event_type, data):
    """Formatea y envía datos como un mensaje de tipo Server-Sent Event."""
    try:
        if isinstance(data, (dict, list)):
            data_str = json.dumps(data)
        else:
            data_str = str(data)
        data_str = data_str.replace('\n', ' ').replace('\r', '')
        print(f"SSE_DATA:{event_type}:{data_str}", flush=True)
    except Exception as e:
        print(f"SSE_DATA:ERROR:Error al enviar mensaje SSE ({event_type}): {e}", flush=True)

async def fetch_url_content(url):
    """Obtiene de forma asíncrona el contenido de una URL."""
    try:
        # Usar requests de forma bloqueante pero ejecutado en un thread separado
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: requests.get(url, timeout=10, verify=False))
        response.raise_for_status()
        return response.content
    except requests.RequestException as e:
        print(f"Advertencia: Error al obtener {url}: {e}", file=sys.stderr)
        return None

async def get_all_urls_from_sitemap(sitemap_url):
    """
    Extrae recursivamente todas las URLs de un sitemap XML y envía eventos SSE para cada URL encontrada.
    Filtra para obtener solo las URLs raíz de cada dominio.
    """
    all_urls = set()
    root_domains = set()  # Para almacenar las URLs raíz de cada dominio
    sitemaps_to_process = [sitemap_url]
    processed_sitemaps = set()
    namespace = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    url_count = 0
    root_count = 0

    send_sse_message("STATUS", f"Iniciando procesamiento del sitemap: {sitemap_url}")

    while sitemaps_to_process:
        current_sitemap_url = sitemaps_to_process.pop(0)
        if current_sitemap_url in processed_sitemaps:
            continue

        send_sse_message("STATUS", f"Procesando sitemap: {current_sitemap_url}")
        processed_sitemaps.add(current_sitemap_url)

        content = await fetch_url_content(current_sitemap_url)
        if not content:
            send_sse_message("WARN", f"No se pudo obtener contenido del sitemap: {current_sitemap_url}")
            continue

        try:
            root = ElementTree.fromstring(content)
            tag_suffix = root.tag.split('}')[-1]  # Manejar prefijos de namespace

            if tag_suffix == "sitemapindex":
                sitemap_locs = [loc.text for loc in root.findall(".//ns:loc", namespace)]
                send_sse_message("STATUS", f"Se encontraron {len(sitemap_locs)} sitemaps anidados en {current_sitemap_url}")
                for loc in sitemap_locs:
                    if loc not in processed_sitemaps and loc not in sitemaps_to_process:
                        sitemaps_to_process.append(loc)
            elif tag_suffix == "urlset":
                url_locs = [loc.text for loc in root.findall(".//ns:loc", namespace)]
                initial_count = len(all_urls)
                
                for loc in url_locs:
                    if loc.lower().endswith(".xml"):  # Es otro sitemap
                        if loc not in processed_sitemaps and loc not in sitemaps_to_process:
                            send_sse_message("STATUS", f"Sitemap anidado encontrado: {loc}")
                            sitemaps_to_process.append(loc)
                    else:  # Es una URL final
                        # Extraer solo la URL raíz (dominio sin path)
                        try:
                            parsed_url = urlparse(loc)
                            root_url = f"{parsed_url.scheme}://{parsed_url.netloc}/"
                            
                            # Si es la primera vez que vemos este dominio
                            if root_url not in root_domains:
                                root_domains.add(root_url)
                                root_count += 1
                                
                                # Registrar solo la URL raíz en la base de datos
                                send_sse_message("FOUND_URL", root_url)
                                send_sse_message("STATUS", f"URL raíz encontrada: {root_url}")
                            
                            # Seguimos contando todas las URLs para estadísticas
                            if loc not in all_urls:
                                all_urls.add(loc)
                                url_count += 1
                        except Exception as e:
                            send_sse_message("ERROR", f"Error procesando URL {loc}: {str(e)}")
                
                added_count = len(all_urls) - initial_count
                if added_count > 0:
                    send_sse_message("STATUS", f"Se procesaron {added_count} URLs, encontrando {root_count} dominios únicos. Total URLs: {url_count}")
            else:
                send_sse_message("WARN", f"Etiqueta raíz desconocida '{root.tag}' en {current_sitemap_url}")

        except ElementTree.ParseError as e:
            send_sse_message("ERROR", f"Error al analizar XML de {current_sitemap_url}: {e}")
        except Exception as e:
            send_sse_message("ERROR", f"Error inesperado procesando {current_sitemap_url}: {e}")

    send_sse_message("STATUS", f"Procesamiento de sitemap finalizado. Se encontraron {len(root_domains)} dominios únicos de un total de {len(all_urls)} URLs.")
    return list(root_domains)  # Retornar solo las URLs raíz

async def extract_email_from_page(url):
    """Extrae correos electrónicos de una página web."""
    try:
        content = await fetch_url_content(url)
        if not content:
            return None, "No se pudo obtener contenido de la página"
        
        soup = BeautifulSoup(content, 'html.parser')
        
        # Extraer título
        title = soup.title.string if soup.title else "Sin título"
        
        # Buscar correos electrónicos en el HTML usando regex
        html_text = str(soup)
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        emails = re.findall(email_pattern, html_text)
        
        # Eliminar duplicados y filtrar resultados no válidos
        unique_emails = list(set(emails))
        valid_emails = [email for email in unique_emails if '.' in email.split('@')[1]]
        
        # Retornar el primer email válido encontrado (o None si no hay)
        email = valid_emails[0] if valid_emails else None
        
        return {
            "url": url,
            "title": title,
            "email": email
        }, None
    except Exception as e:
        return None, f"Error procesando {url}: {str(e)}"

async def process_urls(urls, max_concurrent=3):
    """Procesa las URLs en paralelo con un límite de concurrencia."""
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def process_url_with_semaphore(url):
        async with semaphore:
            send_sse_message("STATUS", f"Procesando URL: {url}")
            result, error = await extract_email_from_page(url)
            
            if error:
                send_sse_message("FAIL", {"url": url, "error": error})
                return {"url": url, "status": "error", "error": error}
            else:
                send_sse_message("SUCCESS", {
                    "url": url,
                    "title": result.get("title", "Sin título"),
                    "email": result.get("email", "No encontrado")
                })
                return {
                    "url": url,
                    "status": "completed",
                    "title": result.get("title", "Sin título"),
                    "email": result.get("email", "")
                }
    
    tasks = [process_url_with_semaphore(url) for url in urls]
    return await asyncio.gather(*tasks)

async def main(sitemap_url, max_concurrent=3):
    """Función principal del script."""
    send_sse_message("STATUS", f"Iniciando extracción desde {sitemap_url}")
    
    # Paso 1: Extraer URLs del sitemap
    urls = await get_all_urls_from_sitemap(sitemap_url)
    if not urls:
        send_sse_message("ERROR", "No se encontraron URLs en el sitemap")
        return
    
    # Limitar a 10 URLs para pruebas (puedes quitar esta línea)
    if len(urls) > 10:
        urls = urls[:10]
        send_sse_message("STATUS", f"Limitando a {len(urls)} URLs para pruebas")
    
    # Paso 2: Procesar cada URL para extraer información
    results = await process_urls(urls, max_concurrent)
    
    # Paso 3: Resumir resultados
    completed = [r for r in results if r.get("status") == "completed"]
    errors = [r for r in results if r.get("status") == "error"]
    
    send_sse_message("SUMMARY", {
        "total": len(urls),
        "completed": len(completed),
        "errors": len(errors)
    })
    
    send_sse_message("STATUS", "Extracción completada")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extrae información de negocios desde sitemaps XML")
    parser.add_argument("--sitemap", "-s", required=True, help="URL del sitemap XML")
    parser.add_argument("--max_concurrent", "-c", type=int, default=3, help="Número máximo de solicitudes concurrentes")
    
    args = parser.parse_args()
    
    try:
        asyncio.run(main(args.sitemap, args.max_concurrent))
    except Exception as e:
        send_sse_message("ERROR", f"Error fatal durante la extracción: {str(e)}")
        sys.exit(1) 