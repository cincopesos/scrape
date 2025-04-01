#!/usr/bin/env python3
import argparse
import json
import re
import sys
import requests
from bs4 import BeautifulSoup
import ssl
import time

# Evitar problemas de SSL
ssl._create_default_https_context = ssl._create_unverified_context

def extract_email_from_url(url):
    """Extrae correo electrónico de una URL específica."""
    try:
        # Intentar obtener el contenido de la página
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }
        
        response = requests.get(url, headers=headers, timeout=10, verify=False)
        response.raise_for_status()
        
        # Analizar el contenido HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extraer título
        title = soup.title.string if soup.title else "Sin título"
        
        # Encontrar emails en el HTML
        html_text = str(soup)
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        emails = re.findall(email_pattern, html_text)
        
        # Filtrar emails válidos (con . en el dominio)
        valid_emails = [email for email in emails if '.' in email.split('@')[1]]
        
        # Eliminar duplicados
        unique_emails = list(set(valid_emails))
        
        # También buscar enlaces mailto:
        mailto_links = [a.get('href') for a in soup.find_all('a', href=True) if 'mailto:' in a.get('href', '')]
        for link in mailto_links:
            email = link.replace('mailto:', '').split('?')[0].strip()
            if email and '@' in email and '.' in email.split('@')[1]:
                unique_emails.append(email)
        
        # Tomar el primer email encontrado (si hay alguno)
        primary_email = unique_emails[0] if unique_emails else None
        
        # Construir resultado
        result = {
            'url': url,
            'title': title,
            'email': primary_email,
            'all_emails': unique_emails,
            'timestamp': time.time()
        }
        
        return result
        
    except Exception as e:
        # En caso de error, devolver información básica
        return {
            'url': url,
            'error': str(e),
            'title': 'Error al procesar',
            'email': None,
            'timestamp': time.time()
        }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Extraer email desde una URL')
    parser.add_argument('--url', required=True, help='URL de la página web a analizar')
    
    args = parser.parse_args()
    
    try:
        result = extract_email_from_url(args.url)
        # Imprimir resultado como JSON para que pueda ser procesado por el llamador
        print(json.dumps(result))
    except Exception as e:
        # Asegurar que siempre devolvemos un JSON válido incluso en caso de error crítico
        print(json.dumps({
            'url': args.url,
            'error': f"Error crítico: {str(e)}",
            'email': None,
            'title': 'Error crítico en procesamiento',
            'timestamp': time.time()
        })) 