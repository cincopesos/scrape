import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { getBusinesses, updateBusinessData } from '@/app/lib/db';
import os from 'os';

// Variable global para rastrear si se solicitó detener el proceso
export let stopRequested = false;

export async function POST() {
  try {
    console.log('Solicitando detener procesos de extracción...');
    stopRequested = true; // Marcar globalmente que se solicitó parar
    
    // Lista de comandos para asegurar que todos los procesos son terminados
    const commands = [];
    
    if (os.platform() === 'win32') {
      // En Windows
      commands.push('taskkill /F /IM python.exe /FI "WINDOWTITLE eq *scrape*"');
      commands.push('taskkill /F /IM python.exe /FI "WINDOWTITLE eq *extract_email*"');
      commands.push('taskkill /F /IM python3.exe /FI "WINDOWTITLE eq *scrape*"');
      commands.push('taskkill /F /IM python3.exe /FI "WINDOWTITLE eq *extract_email*"');
    } else {
      // En Linux/Mac - intentar varios patrones
      commands.push("pkill -f 'python.*scrape'");
      commands.push("pkill -f 'python.*extract_email'");
      commands.push("pkill -f 'python3.*scrape'");
      commands.push("pkill -f 'python3.*extract_email'");
      // Intentar matar con SIGKILL (forzado) si lo anterior no funciona
      commands.push("pkill -9 -f 'python.*scrape'");
      commands.push("pkill -9 -f 'python.*extract_email'");
    }
    
    // Ejecutar todos los comandos en secuencia
    for (const cmd of commands) {
      try {
        console.log(`Ejecutando comando: ${cmd}`);
        exec(cmd);
        // No esperamos resultado, solo lanzamos el comando
      } catch (e) {
        console.log(`Error al ejecutar ${cmd}: ${e}`);
        // Continuamos con el siguiente comando incluso si este falla
      }
    }
    
    // Esperar un momento para que los procesos terminen
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Ahora actualizar las URLs pendientes
    try {
      console.log('Actualizando estado de URLs pendientes...');
      const pendingBusinesses = await getBusinesses({ status: 'pending' });
      const processingBusinesses = await getBusinesses({ status: 'processing' });
      
      const totalToUpdate = pendingBusinesses.length + processingBusinesses.length;
      
      if (totalToUpdate > 0) {
        console.log(`Encontradas ${totalToUpdate} URLs (${pendingBusinesses.length} pendientes + ${processingBusinesses.length} procesando) para marcar como error`);
        
        // Actualizar todas las pendientes
        for (const business of [...pendingBusinesses, ...processingBusinesses]) {
          await updateBusinessData(business.url, {
            status: 'error',
            error_message: 'Proceso cancelado por el usuario',
            processed_at: new Date().toISOString()
          });
        }
        console.log(`${totalToUpdate} URLs marcadas como error`);
      } else {
        console.log('No se encontraron URLs pendientes para actualizar');
      }
    } catch (err) {
      console.error('Error actualizando URLs pendientes:', err);
    }
    
    // Responder éxito
    return NextResponse.json({ 
      success: true, 
      message: 'Todos los procesos detenidos. Las URLs pendientes y en procesamiento fueron marcadas como error.'
    });
    
  } catch (error) {
    console.error('Error al intentar detener la extracción:', error);
    return NextResponse.json(
      { error: 'Error al intentar detener la extracción', details: String(error) },
      { status: 500 }
    );
  } finally {
    // Asegurarnos de resetear la bandera después de 3 segundos
    // para permitir futuros inicios de procesos
    setTimeout(() => {
      stopRequested = false;
      console.log('Bandera de detención reseteada, se pueden iniciar nuevos procesos');
    }, 3000);
  }
} 