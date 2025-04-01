#!/usr/bin/env python3
import argparse
import json
import re
import sys
import time
import sqlite3
import os
import requests
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
import ssl
import concurrent.futures
from datetime import datetime
import threading

# Evitar problemas de SSL
ssl._create_default_https_context = ssl._create_unverified_context

# Configuración de base de datos
DATA_DIR = os.path.join(os.getcwd(), 'data')
DB_PATH = os.path.join(DATA_DIR, 'business_data.sqlite')
USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36'
MAX_RETRIES = 3
TIMEOUT = 10
EMAIL_REGEX = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
LOCK = threading.Lock()

def log_message(message):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"{timestamp} - {message}")
    sys.stdout.flush()

def send_sse_event(event_type, data):
    """Enviar un evento SSE al proceso padre"""
    json_data = json.dumps(data)
    print(f"SSE_DATA:{event_type}:{json_data}")
    sys.stdout.flush()

def connect_db():
    """Conectar a la base de datos SQLite"""
    return sqlite3.connect(DB_PATH)

def get_pending_urls(status=None, limit=100, sitemap=None):
    """Obtener URLs pendientes para procesar según filtros"""
    conn = connect_db()
    cursor = conn.cursor()
    
    query = "SELECT url, sitemap_url FROM businesses WHERE 1=1"
    params = []

    # Filtrar por estado si se proporciona
    if status:
        query += " AND status = ?"
        params.append(status)
    
    # Filtrar por sitemap si se proporciona
    if sitemap:
        query += " AND sitemap_url = ?"
        params.append(sitemap)
    
    query += f" LIMIT {int(limit)}"
    
    log_message(f"Ejecutando consulta: {query} con parámetros: {params}")
    cursor.execute(query, params)
    urls = cursor.fetchall()
    conn.close()
    
    return urls

def update_status(url, status, **kwargs):
    """Actualizar el estado de una URL en la base de datos"""
    conn = connect_db()
    cursor = conn.cursor()
    
    set_clause = "status = ?"
    params = [status]
    
    # Agregar campos adicionales si se proporcionan
    for key, value in kwargs.items():
        set_clause += f", {key} = ?"
        params.append(value)
    
    params.append(url)  # Para la cláusula WHERE
    
    query = f"UPDATE businesses SET {set_clause} WHERE url = ?"
    cursor.execute(query, params)
    conn.commit()
    conn.close()

def extract_info(url):
    """Extraer información de una página web"""
    headers = {'User-Agent': USER_AGENT}
    
    for attempt in range(MAX_RETRIES):
        try:
            log_message(f"Intentando acceder a: {url}")
            response = requests.get(url, headers=headers, timeout=TIMEOUT)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extraer título
            title = None
            title_tag = soup.find('title')
            if title_tag:
                title = title_tag.text.strip()
                log_message(f"Título extraído: {title[:50]}...")
            
            # Extraer descripción
            description = None
            meta_desc = soup.find('meta', attrs={'name': 'description'})
            if meta_desc and meta_desc.get('content'):
                description = meta_desc.get('content').strip()
                log_message(f"Descripción extraída: {description[:50]}...")
            
            # Extraer correos electrónicos
            email = None
            emails = re.findall(EMAIL_REGEX, response.text)
            if emails:
                # Filtrar correos que probablemente sean genéricos o plantillas
                filtered_emails = [e for e in emails if not any(x in e for x in ['example', 'user', 'domain'])]
                if filtered_emails:
                    email = filtered_emails[0]  # Tomar el primer correo válido
                    log_message(f"Email extraído: {email}")
            
            # Extracción mejorada de dirección
            address = None
            address_candidates = []
            
            # 1. Buscar en elementos con clases o IDs comunes para direcciones
            address_elements = soup.select('.address, #address, .location, #location, .contact-address, [itemprop="address"], .footer-address, .contact-info address, .store-address')
            for elem in address_elements:
                txt = elem.get_text().strip()
                if txt and len(txt) > 10 and len(txt) < 200:  # Una dirección típica
                    address_candidates.append(txt)
                    log_message(f"Candidato de dirección encontrado en elemento específico: {txt[:50]}...")
            
            # 2. Buscar en schema.org markup
            schema_scripts = soup.find_all('script', type='application/ld+json')
            for script in schema_scripts:
                try:
                    data = json.loads(script.string)
                    if isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict) and 'address' in item:
                                addr = item['address']
                                if isinstance(addr, dict):
                                    addr_parts = []
                                    if 'streetAddress' in addr:
                                        addr_parts.append(addr['streetAddress'])
                                    if 'addressLocality' in addr:
                                        addr_parts.append(addr['addressLocality'])
                                    if 'addressRegion' in addr:
                                        addr_parts.append(addr['addressRegion'])
                                    if 'postalCode' in addr:
                                        addr_parts.append(addr['postalCode'])
                                    if 'addressCountry' in addr:
                                        if isinstance(addr['addressCountry'], str):
                                            addr_parts.append(addr['addressCountry'])
                                        elif isinstance(addr['addressCountry'], dict) and 'name' in addr['addressCountry']:
                                            addr_parts.append(addr['addressCountry']['name'])
                                    
                                    if addr_parts:
                                        full_addr = ', '.join(addr_parts)
                                        address_candidates.append(full_addr)
                                        log_message(f"Candidato de dirección encontrado en schema.org: {full_addr}")
                    elif isinstance(data, dict) and 'address' in data:
                        addr = data['address']
                        if isinstance(addr, dict):
                            addr_parts = []
                            if 'streetAddress' in addr:
                                addr_parts.append(addr['streetAddress'])
                            if 'addressLocality' in addr:
                                addr_parts.append(addr['addressLocality'])
                            if 'addressRegion' in addr:
                                addr_parts.append(addr['addressRegion'])
                            if 'postalCode' in addr:
                                addr_parts.append(addr['postalCode'])
                            if 'addressCountry' in addr:
                                if isinstance(addr['addressCountry'], str):
                                    addr_parts.append(addr['addressCountry'])
                                elif isinstance(addr['addressCountry'], dict) and 'name' in addr['addressCountry']:
                                    addr_parts.append(addr['addressCountry']['name'])
                            
                            if addr_parts:
                                full_addr = ', '.join(addr_parts)
                                address_candidates.append(full_addr)
                                log_message(f"Candidato de dirección encontrado en schema.org: {full_addr}")
                except Exception as e:
                    log_message(f"Error procesando schema.org: {str(e)}")
            
            # 3. Si no encontramos nada en clases específicas, buscar patrones de dirección
            if not address_candidates:
                # Patrones comunes de direcciones (buscar cosas que se parezcan a direcciones)
                address_patterns = [
                    r'\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Plaza|Square|Sq|Highway|Hwy|Route|RT|Parkway|Pkwy|Circle|Cir|Terrace|Ter|Place|Pl),?\s+[A-Za-z\s]+,?\s+[A-Z]{2}\s+\d{5}(-\d{4})?',  # US Style
                    r'\d+\s+[A-Za-z\s]+,\s+[A-Za-z\s]+,\s+[A-Z]{2}\s+\d{5}(-\d{4})?',  # Simplified US
                    r'\d+\s+[A-Za-z\s]+,\s+[A-Za-z\s]+,\s+[A-Z|a-z]{1,2}\d{1,2}\s+\d{1,2}[A-Z|a-z]{2}',  # UK Postcode
                    r'calle|avenida|av\.|carrera|cra\.|carrer|via|vía|paseo|plaza|boulevard|blvd\.', # Palabras clave en español
                    r'rua|avenida|av\.|praça|alameda|estrada|rodovia',  # Palabras clave en portugués
                ]
                
                # Buscar en párrafos que podrían contener direcciones
                for p in soup.find_all(['p', 'div', 'span']):
                    txt = p.get_text().strip()
                    # Verificar tamaño razonable para dirección
                    if len(txt) > 10 and len(txt) < 200:
                        # Verificar si coincide con alguno de los patrones
                        for pattern in address_patterns:
                            if re.search(pattern, txt, re.IGNORECASE):
                                address_candidates.append(txt)
                                log_message(f"Candidato de dirección encontrado por patrón: {txt[:50]}...")
                                break
                
                # Buscar específicamente en secciones de contacto
                contact_sections = soup.select('.contact, #contact, .contact-info, #contact-info, .contacto, #contacto, footer')
                for section in contact_sections:
                    paragraphs = section.find_all(['p', 'div', 'span', 'address'])
                    for p in paragraphs:
                        txt = p.get_text().strip()
                        if len(txt) > 10 and len(txt) < 200:
                            # Verificar si tiene números y algunas palabras clave
                            if re.search(r'\d+', txt) and any(re.search(kw, txt, re.IGNORECASE) for kw in ['address', 'location', 'street', 'avenue', 'calle', 'avenida', 'rua']):
                                address_candidates.append(txt)
                                log_message(f"Candidato de dirección encontrado en sección de contacto: {txt[:50]}...")
            
            # Evaluar candidatos y elegir la mejor dirección
            if address_candidates:
                # Primero intentar encontrar una dirección que tenga un código postal
                for cand in address_candidates:
                    # Verificar si tiene formato de código postal (números y letras específicas)
                    if re.search(r'\b\d{5}(-\d{4})?\b|\b[A-Z]{1,2}\d{1,2}\s+\d{1,2}[A-Z]{2}\b', cand):
                        address = cand
                        log_message(f"Dirección seleccionada con código postal: {address[:50]}...")
                        break
                
                # Si no hay con código postal, elegir la que parece más completa (más números y comas)
                if not address:
                    # Ordenar por "complejidad" - más comas y números suelen indicar direcciones más completas
                    address_candidates.sort(key=lambda x: (x.count(',') + len(re.findall(r'\d+', x))), reverse=True)
                    address = address_candidates[0]
                    log_message(f"Dirección seleccionada por complejidad: {address[:50]}...")
            
            # Construir resultado y devolver
            result = {
                'url': url,
                'title': title,
                'description': description,
                'email': email,
                'address': address
            }
            
            log_message(f"Extraído con éxito para {url}: título=✓, descripción={'✓' if description else '✗'}, email={'✓' if email else '✗'}, dirección={'✓' if address else '✗'}")
            
            return result
            
        except requests.RequestException as e:
            if attempt == MAX_RETRIES - 1:
                log_message(f"Error final accediendo a {url}: {str(e)}")
                return {'url': url, 'error': str(e)}
            else:
                log_message(f"Intento {attempt+1} fallido para {url}: {str(e)}. Reintentando...")
                time.sleep(1)
        except Exception as e:
            log_message(f"Error procesando {url}: {str(e)}")
            return {'url': url, 'error': str(e)}
    
    return {'url': url, 'error': 'Máximo de reintentos alcanzado'}

def process_url(url_data):
    """Procesar una URL y actualizar la base de datos"""
    url, sitemap_url = url_data
    
    # Actualizar estado a "processing"
    with LOCK:
        update_status(url, "processing", processed_at=datetime.now().isoformat())
    
    # Extraer información
    log_message(f"Procesando URL: {url}")
    result = extract_info(url)
    
    # Manejar resultado
    if 'error' in result:
        with LOCK:
            update_status(
                url, 
                "error",
                error_message=result['error'],
                processed_at=datetime.now().isoformat()
            )
        send_sse_event('FAIL', {'url': url, 'error': result['error']})
        return False
    else:
        with LOCK:
            update_status(
                url,
                "completed",
                title=result.get('title', 'Sin título'),
                description=result.get('description'),
                email=result.get('email'),
                address=result.get('address'),
                processed_at=datetime.now().isoformat()
            )
        send_sse_event('SUCCESS', result)
        return True

def process_batch(batch, args, progress_callback=None):
    """Procesar un lote de URLs en paralelo"""
    successful = 0
    failed = 0
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_to_url = {executor.submit(process_url, url_data): url_data for url_data in batch}
        for future in concurrent.futures.as_completed(future_to_url):
            url_data = future_to_url[future]
            try:
                if future.result():
                    successful += 1
                else:
                    failed += 1
                
                if progress_callback:
                    progress_callback(successful, failed)
            except Exception as e:
                log_message(f"Error procesando {url_data[0]}: {str(e)}")
                failed += 1
                if progress_callback:
                    progress_callback(successful, failed)
    
    return successful, failed

def main():
    parser = argparse.ArgumentParser(description='Procesar URLs para extraer información.')
    parser.add_argument('--status', help='Filtrar por estado (pending, error, completed, processing)')
    parser.add_argument('--limit', type=int, default=100, help='Número máximo de URLs a procesar')
    parser.add_argument('--sitemap', help='Filtrar por URL de sitemap específico')
    parser.add_argument('--workers', type=int, default=5, help='Número de trabajadores paralelos')
    parser.add_argument('--batch-size', type=int, default=10, help='Tamaño del lote para procesar')
    
    args = parser.parse_args()
    
    # Imprimir parámetros para verificación
    log_message(f"Iniciando con parámetros: status={args.status}, limit={args.limit}, sitemap={args.sitemap}")
    log_message(f"Configuración: workers={args.workers}, batch_size={args.batch_size}")
    
    # Obtener URLs para procesar
    urls = get_pending_urls(status=args.status, limit=args.limit, sitemap=args.sitemap)
    
    if not urls:
        log_message("No se encontraron URLs para procesar con los filtros especificados.")
        send_sse_event('SUMMARY', {
            'total': 0,
            'successful': 0,
            'failed': 0,
            'message': 'No se encontraron URLs para procesar con los filtros especificados.'
        })
        sys.exit(0)
    
    log_message(f"Se encontraron {len(urls)} URLs para procesar.")
    
    # Procesar en lotes
    total_successful = 0
    total_failed = 0
    start_time = time.time()
    
    for i in range(0, len(urls), args.batch_size):
        batch = urls[i:i + args.batch_size]
        log_message(f"Procesando lote {i//args.batch_size + 1}/{(len(urls) + args.batch_size - 1)//args.batch_size}")
        
        def progress_callback(successful, failed):
            progress = (i + successful + failed) / len(urls) * 100
            log_message(f"Progreso: {progress:.1f}% - Éxito: {total_successful + successful}, Fallos: {total_failed + failed}")
        
        success, fail = process_batch(batch, args, progress_callback)
        total_successful += success
        total_failed += fail
    
    elapsed_time = time.time() - start_time
    log_message(f"Procesamiento completado en {elapsed_time:.2f} segundos.")
    log_message(f"Resultados: {total_successful} exitosos, {total_failed} fallidos de {len(urls)} URLs.")
    
    # Enviar resumen final
    send_sse_event('SUMMARY', {
        'total': len(urls),
        'successful': total_successful,
        'failed': total_failed,
        'time_seconds': elapsed_time,
        'message': f"Procesamiento completado: {total_successful} exitosos, {total_failed} fallidos."
    })

if __name__ == "__main__":
    main() 