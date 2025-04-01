import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { addBusinessUrl, getBusinessStats, getBusinesses, updateBusinessData } from '@/app/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { stopRequested } from '../extract/stop/route';

// Asegurarse de que el directorio data existe
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Variable para mantener el ID del proceso actual
let currentProcessId: string | null = null;
// Almacenar el sitemap URL actual para seguimiento
let currentSitemapUrl: string | null = null;

// Función para manejar la solicitud POST (iniciar extracción)
export async function POST(request: NextRequest) {
  try {
    // Verificar si hay una solicitud de detención
    if (stopRequested) {
      return NextResponse.json(
        { error: 'Existe un proceso de detención activo. Espere a que finalice antes de iniciar una nueva extracción.' },
        { status: 400 }
      );
    }

    const { sitemapUrl } = await request.json();
    
    if (!sitemapUrl || !sitemapUrl.startsWith('http')) {
      return NextResponse.json(
        { error: 'Invalid sitemap URL. Must start with http:// or https://' },
        { status: 400 }
      );
    }
    
    // Generar un ID único para esta tarea
    const taskId = uuidv4();
    currentProcessId = taskId;
    currentSitemapUrl = sitemapUrl;
    console.log(`Starting extraction from ${sitemapUrl} with task ID: ${taskId}`);
    
    // Crear proceso para ejecutar el script simple_scrape.py
    const pythonProcess = spawn('python3', [
      'scripts/simple_scrape.py',
      '--sitemap', sitemapUrl,
      '--max_concurrent', '3'
    ]);
    
    let buffer = '';
    
    // Manejar la salida estándar
    pythonProcess.stdout.on('data', async (data) => {
      // Verificar si se solicitó detener
      if (stopRequested) {
        console.log('Detectada solicitud de detención durante el procesamiento');
        pythonProcess.kill();
        return;
      }

      const text = data.toString();
      console.log('Salida de simple_scrape.py:', text);
      
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
            
            if (eventType === 'FOUND_URL' && eventData) {
              try {
                // Registrar URL en la base de datos
                const url = eventData.trim();
                if (url && url.startsWith('http') && url.includes('.')) {
                  console.log('URL registrada:', url);
                  // IMPORTANTE: Asegurarse que la URL se registra con estado 'pending'
                  await addBusinessUrl(url, sitemapUrl);
                  
                  // Log explícito para depuración
                  console.log(`URL ${url} registrada correctamente en la base de datos`);
                }
              } catch (err) {
                console.error('Error registrando URL:', err);
              }
            } 
            else if (eventType === 'SUCCESS' && eventData) {
              try {
                // Parsear los datos de éxito
                const data = JSON.parse(eventData);
                const url = data.url;
                
                if (url) {
                  await updateBusinessData(url, {
                    title: data.title || 'Sin título',
                    email: data.email || null,
                    status: 'completed',
                    processed_at: new Date().toISOString()
                  });
                  console.log(`URL procesada con éxito: ${url}`);
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
                console.log('Resumen de la extracción:', data);
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
    pythonProcess.on('close', async (code) => {
      console.log(`Proceso de extracción finalizado con código: ${code}`);
      
      // Verificar si se solicitó detener
      if (stopRequested) {
        console.log('Proceso terminado debido a una solicitud de detención');
        currentProcessId = null;
        currentSitemapUrl = null;
        return;
      }
      
      // Iniciar fase de procesamiento de URLs (extracción de emails)
      if (code === 0 && currentProcessId === taskId) {
        try {
          console.log('Iniciando la fase de extracción de emails...');
          const pendingBusinesses = await getBusinesses({ status: 'pending' });
          
          if (pendingBusinesses.length === 0) {
            console.log('No hay URLs pendientes para procesar');
            currentProcessId = null;
            currentSitemapUrl = null;
            return;
          }
          
          console.log(`Procesando ${pendingBusinesses.length} URLs para extraer información...`);
          
          // Procesar cada URL en lotes pequeños para evitar sobrecargar el sistema
          const batchSize = 5; // Procesar de 5 en 5
          
          for (let i = 0; i < pendingBusinesses.length; i += batchSize) {
            // Verificar si se solicitó detener
            if (stopRequested || currentProcessId !== taskId) {
              console.log('Detección de cancelación en el procesamiento por lotes');
              break; // Detener el procesamiento si el ID de tarea cambió o se solicitó detener
            }
            
            const batch = pendingBusinesses.slice(i, i + batchSize);
            console.log(`Procesando lote ${i/batchSize + 1} de ${Math.ceil(pendingBusinesses.length/batchSize)}, URLs: ${batch.map(b => b.url).join(', ')}`);
            
            // Crear procesos paralelos para cada URL en el lote
            const promises = batch.map(async (business) => {
              try {
                // Verificar si se solicitó detener
                if (stopRequested) {
                  return;
                }
                
                // Marcar como en procesamiento
                await updateBusinessData(business.url, { status: 'processing' });
                
                // Ejecutar proceso para extraer información de la URL
                const extractProcess = spawn('python3', [
                  'scripts/simple_extract_email.py',
                  '--url', business.url
                ]);
                
                return new Promise<void>((resolve) => {
                  let outputData = '';
                  let errorData = '';
                  
                  extractProcess.stdout.on('data', (data) => {
                    outputData += data.toString();
                  });
                  
                  extractProcess.stderr.on('data', (data) => {
                    errorData += data.toString();
                  });
                  
                  extractProcess.on('close', async (code) => {
                    try {
                      // Verificar si se solicitó detener
                      if (stopRequested) {
                        await updateBusinessData(business.url, {
                          status: 'error',
                          error_message: 'Proceso cancelado por el usuario',
                          processed_at: new Date().toISOString()
                        });
                        resolve();
                        return;
                      }
                      
                      if (code === 0 && outputData) {
                        // Intentar parsear la salida como JSON
                        try {
                          const result = JSON.parse(outputData);
                          
                          await updateBusinessData(business.url, {
                            title: result.title || 'Sin título',
                            email: result.email || null,
                            status: 'completed',
                            processed_at: new Date().toISOString()
                          });
                          
                          console.log(`URL procesada exitosamente: ${business.url}`);
                        } catch (parseError) {
                          console.error(`Error al parsear la salida para ${business.url}:`, parseError);
                          await updateBusinessData(business.url, {
                            status: 'completed',
                            processed_at: new Date().toISOString()
                          });
                        }
                      } else {
                        // Si hubo error, marcar la URL como completada de todas formas
                        await updateBusinessData(business.url, {
                          status: 'completed',
                          error_message: errorData || `Código de salida: ${code}`,
                          processed_at: new Date().toISOString()
                        });
                        console.log(`URL marcada como completada con advertencias: ${business.url}`);
                      }
                    } catch (err) {
                      console.error(`Error al actualizar el estado de ${business.url}:`, err);
                    }
                    resolve();
                  });
                });
              } catch (err) {
                console.error(`Error procesando ${business.url}:`, err);
                
                // En caso de error, marcar como error
                try {
                  await updateBusinessData(business.url, {
                    status: 'error',
                    error_message: String(err),
                    processed_at: new Date().toISOString()
                  });
                } catch (updateErr) {
                  console.error(`Error al actualizar estado de error para ${business.url}:`, updateErr);
                }
              }
            });
            
            await Promise.all(promises);
            
            // Si se solicitó detener, salir del bucle
            if (stopRequested) {
              break;
            }
            
            // Esperar un breve momento entre lotes para no sobrecargar
            if (i + batchSize < pendingBusinesses.length) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          console.log('Procesamiento de todas las URLs completado');
        } catch (err) {
          console.error('Error durante el procesamiento de URLs:', err);
        }
      }
      
      // Actualizar todas las URLs pendientes como completadas o error
      try {
        const pendingBusinesses = await getBusinesses({ status: 'pending' });
        for (const business of pendingBusinesses) {
          await updateBusinessData(business.url, {
            status: code === 0 ? 'completed' : 'error',
            processed_at: new Date().toISOString(),
            error_message: code !== 0 ? 'El proceso de extracción terminó con errores' : null
          });
        }
      } catch (err) {
        console.error('Error actualizando estado final de URLs:', err);
      }
      
      // Limpiar las variables globales
      if (currentProcessId === taskId) {
        currentProcessId = null;
        currentSitemapUrl = null;
      }
    });
    
    // Responder inmediatamente con el ID de la tarea
    return NextResponse.json({ 
      success: true, 
      taskId,
      message: 'Extracción iniciada. Los resultados se actualizarán en tiempo real.' 
    });
    
  } catch (error) {
    console.error('Error iniciando extracción:', error);
    return NextResponse.json(
      { error: 'Error al iniciar la extracción', details: String(error) },
      { status: 500 }
    );
  }
}

// Función para manejar la solicitud GET (obtener estadísticas)
export async function GET(request: NextRequest) {
  try {
    // Obtener estadísticas actualizadas
    const stats = await getBusinessStats();
    
    // Obtener las últimas URLs procesadas para depuración (aumentado a 50)
    const recentBusinesses = await getBusinesses({ limit: 50 });
    
    return NextResponse.json({
      stats,
      recentBusinesses,
      isRunning: currentProcessId !== null,
      currentSitemap: currentSitemapUrl,
      timestamp: new Date().toISOString(),
      stopRequested
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return NextResponse.json(
      { error: 'Error al obtener estadísticas', details: String(error) },
      { status: 500 }
    );
  }
} 