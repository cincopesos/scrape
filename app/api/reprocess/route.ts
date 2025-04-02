import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { updateBusinessData } from '@/app/lib/db';

// Variable para mantener el ID del proceso actual
let currentProcessId: string | null = null;
let isProcessing = false;

// Función para manejar la solicitud POST (iniciar reprocesamiento)
export async function POST(request: NextRequest) {
  try {
    // Verificar si ya hay un proceso en ejecución
    if (isProcessing) {
      return NextResponse.json(
        { error: 'Ya hay un proceso de reprocesamiento activo' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status, limit, sitemap } = body;
    
    // Validar parámetros
    const validStatus = ['pending', 'error', 'completed', 'processing', null, undefined];
    if (status && !validStatus.includes(status)) {
      return NextResponse.json(
        { error: 'Estado no válido. Debe ser: pending, error, completed, processing o null' },
        { status: 400 }
      );
    }
    
    const numLimit = parseInt(limit as string) || 100;
    if (numLimit <= 0 || numLimit > 15000) {
      return NextResponse.json(
        { error: 'El límite debe estar entre 1 y 15000' },
        { status: 400 }
      );
    }
    
    console.log(`Iniciando reprocesamiento con filtros: estado=${status || 'cualquiera'}, sitemap=${sitemap || 'cualquiera'}, límite=${numLimit}`);
    
    // Construir argumentos para el script
    const args = ['scripts/enhanced_extract.py'];
    
    if (status) {
      args.push('--status', status);
    }
    
    args.push('--limit', numLimit.toString());
    
    if (sitemap) {
      args.push('--sitemap', sitemap);
    }
    
    // Configurar paralelismo y límites para evitar bloqueos
    args.push('--workers', '2');
    args.push('--batch-size', '3');
    args.push('--delay', '2.0');
    
    // Marcar como procesando
    isProcessing = true;
    
    // Logging completo para depuración
    console.log('Comando a ejecutar:', 'python3', args.join(' '));
    
    // Ejecutar el script de Python
    const pythonProcess = spawn('python3', args);
    
    let buffer = '';
    
    // Manejar la salida estándar
    pythonProcess.stdout.on('data', async (data) => {
      const text = data.toString();
      console.log('Salida de enhanced_extract.py:', text);
      
      // Procesar el buffer junto con los nuevos datos
      buffer += text;
      
      // Buscar y procesar eventos SSE
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Guardar la última línea incompleta para el próximo chunk
      
      for (const line of lines) {
        if (line.startsWith('SSE_DATA:')) {
          try {
            // Formato: SSE_DATA:TIPO:DATOS
            const fullLine = line.substring(9);
            const colonIndex = fullLine.indexOf(':');
            if (colonIndex === -1) continue;
            
            const eventType = fullLine.substring(0, colonIndex);
            const eventData = fullLine.substring(colonIndex + 1);
            
            console.log(`Evento SSE: ${eventType} - Datos: ${eventData.substring(0, 100)}...`);
            
            if (eventType === 'SUCCESS' && eventData) {
              try {
                // Parsear los datos de éxito
                const data = JSON.parse(eventData);
                const url = data.url;
                
                if (url) {
                  // Verificar datos extraídos
                  console.log(`Datos extraídos para ${url}:`, {
                    title: data.title || 'No disponible',
                    description: data.description || 'No disponible',
                    email: data.email || 'No disponible',
                    address: data.address || 'No disponible'
                  });
                  
                  // Verificar explícitamente la presencia de dirección
                  if (data.address) {
                    console.log(`Dirección encontrada para ${url}: "${data.address}"`);
                  } else {
                    console.log(`No se encontró dirección para ${url}`);
                  }
                  
                  await updateBusinessData(url, {
                    title: data.title || 'Sin título',
                    description: data.description || null,
                    email: data.email || null,
                    address: data.address || null,
                    status: 'completed',
                    processed_at: new Date().toISOString()
                  });
                  console.log(`URL reprocesada con éxito: ${url}`);
                }
              } catch (err) {
                console.error(`Error procesando datos SUCCESS: ${err}`);
              }
            }
            else if (eventType === 'FAIL' && eventData) {
              try {
                // Parsear los datos de error
                const data = JSON.parse(eventData);
                const url = data.url;
                
                if (url) {
                  await updateBusinessData(url, {
                    error_message: data.error || 'Error desconocido',
                    status: 'error',
                    processed_at: new Date().toISOString()
                  });
                  console.log(`URL marcada con error: ${url}`);
                }
              } catch (err) {
                console.error(`Error procesando datos FAIL: ${err}`);
              }
            }
            else if (eventType === 'SUMMARY' && eventData) {
              try {
                const data = JSON.parse(eventData);
                console.log('Resumen del reprocesamiento:', data);
              } catch (err) {
                console.error(`Error procesando datos SUMMARY: ${err}`);
              }
            }
          } catch (err) {
            console.error('Error procesando evento SSE:', err);
          }
        }
      }
    });
    
    // Manejar errores
    pythonProcess.stderr.on('data', (data) => {
      console.error(`Error en proceso Python: ${data}`);
    });
    
    // Manejar finalización del proceso
    pythonProcess.on('close', (code) => {
      console.log(`Proceso de reprocesamiento finalizado con código: ${code}`);
      isProcessing = false;
    });
    
    return NextResponse.json({ 
      message: 'Reprocesamiento iniciado',
      params: {
        status: status || 'cualquiera',
        limit: numLimit,
        sitemap: sitemap || 'cualquiera'
      }
    });
    
  } catch (error) {
    console.error('Error iniciando el reprocesamiento:', error);
    isProcessing = false;
    return NextResponse.json(
      { error: `Error al iniciar el reprocesamiento: ${error}` },
      { status: 500 }
    );
  }
}

// Función para manejar la solicitud GET (obtener estado)
export async function GET(request: NextRequest) {
  return NextResponse.json({
    isProcessing
  });
} 