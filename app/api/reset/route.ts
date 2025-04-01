import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function POST() {
  try {
    // Ruta a la base de datos SQLite
    const dbPath = path.join(process.cwd(), 'data', 'business_data.sqlite');
    
    // Verificar si la base de datos existe
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({
        success: true,
        message: 'No hay base de datos para reiniciar'
      });
    }
    
    // Detener cualquier proceso Python en ejecución
    let killCommand;
    if (os.platform() === 'win32') {
      // Windows
      killCommand = 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq *simple_scrape*"';
    } else {
      // Linux/Mac
      killCommand = "pkill -f 'python.*simple_scrape'";
    }
    
    // Ejecutar comando de forma no bloqueante
    exec(killCommand, (error, stdout, stderr) => {
      console.log('Resultado de la detención de procesos:', { error, stdout, stderr });
    });
    
    // Conectar a la base de datos y eliminar todos los registros
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
        if (err) {
          console.error('Error al abrir la base de datos:', err);
          resolve(NextResponse.json(
            { error: 'Error al abrir la base de datos', details: err.message },
            { status: 500 }
          ));
          return;
        }
        
        // Eliminar todos los registros de la tabla businesses
        db.run('DELETE FROM businesses', function(err) {
          db.close();
          
          if (err) {
            console.error('Error al eliminar registros:', err);
            resolve(NextResponse.json(
              { error: 'Error al eliminar registros', details: err.message },
              { status: 500 }
            ));
            return;
          }
          
          console.log(`Base de datos limpiada. Se eliminaron ${this.changes} registros.`);
          resolve(NextResponse.json({
            success: true,
            message: `Base de datos reiniciada correctamente. Se eliminaron ${this.changes} registros.`
          }));
        });
      });
    });
    
  } catch (error) {
    console.error('Error al reiniciar la base de datos:', error);
    return NextResponse.json(
      { error: 'Error al reiniciar la base de datos', details: String(error) },
      { status: 500 }
    );
  }
} 