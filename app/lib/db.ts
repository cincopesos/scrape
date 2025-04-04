import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import fs from 'fs';
import path from 'path';

// Asegurar que el directorio data existe
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'business_data.sqlite');

// Tipo de datos para negocios
export interface BusinessData {
  url: string;
  sitemap_url?: string | null;
  title?: string | null;
  description?: string | null;
  email?: string | null;
  address?: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error_message?: string | null;
  processed_at?: string | null;
}

// Conectar a la base de datos SQLite
export async function getDb(): Promise<Database> {
  return open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
}

// Inicializar la base de datos
export async function initDb(): Promise<void> {
  const db = await getDb();
  
  try {
    console.log("Verificando base de datos...");
    
    // Verificar si la tabla existe
    const tableExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='businesses'");
    
    if (!tableExists) {
      console.log("Tabla businesses no existe, creándola...");
      
      // Crear tabla para los datos de negocios solo si no existe
      await db.exec(`
        CREATE TABLE IF NOT EXISTS businesses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT UNIQUE NOT NULL,
          sitemap_url TEXT,
          title TEXT,
          description TEXT,
          email TEXT,
          address TEXT,
          status TEXT DEFAULT 'pending',
          error_message TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          processed_at TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      console.log("Base de datos inicializada correctamente");
    } else {
      console.log("Tabla businesses ya existe, no se realizaron cambios");
    }
    
    // Verificar la estructura de la tabla
    const table = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='businesses'");
    console.log("Estructura de la tabla businesses:", table?.sql);
  } catch (error) {
    console.error("Error al inicializar la base de datos:", error);
    throw error;
  } finally {
    // Cerrar conexión
    await db.close();
  }
}

// Inicializar la base de datos al importar este módulo
initDb().catch(err => {
  console.error('Error inicializando la base de datos:', err);
});

// Agregar URL de negocio a la base de datos
export async function addBusinessUrl(url: string, sitemapUrl: string | null = null): Promise<number> {
  const db = await getDb();
  
  try {
    console.log(`DB: Insertando URL: ${url} (sitemap: ${sitemapUrl || 'N/A'})`);
    
    // Verificar si la URL ya existe
    const existing = await db.get('SELECT id FROM businesses WHERE url = ?', [url]);
    
    if (existing) {
      console.log(`DB: URL ${url} ya existe con ID ${existing.id}`);
      return existing.id;
    }
    
    // Si no existe, insertarla
    const result = await db.run(
      `INSERT INTO businesses 
       (url, sitemap_url, status, created_at, updated_at) 
       VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [url, sitemapUrl]
    );
    
    const id = result.lastID || 0;
    console.log(`DB: URL ${url} insertada con ID ${id}`);
    
    // Verificar que se haya insertado correctamente
    const inserted = await db.get('SELECT * FROM businesses WHERE id = ?', [id]);
    if (inserted) {
      console.log(`DB: Verificación post-inserción exitosa: ${JSON.stringify(inserted)}`);
    } else {
      console.error(`DB: ERROR - La URL ${url} no se insertó correctamente`);
    }
    
    return id;
  } catch (error) {
    console.error(`DB ERROR en addBusinessUrl para ${url}:`, error);
    throw error;
  } finally {
    await db.close();
  }
}

// Función para actualizar datos de empresa
export async function updateBusinessData(url: string, data: any): Promise<boolean> {
  const db = await getDb();
  
  try {
    // Crear un set de valores para la consulta SQL
    const updateFields: string[] = [];
    const values: any[] = [];
    
    // Agregar cada campo no nulo al conjunto de actualizaciones
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        updateFields.push(`${key} = ?`);
        values.push(value);
      }
    });
    
    // Si no hay campos para actualizar, retornar
    if (updateFields.length === 0) {
      console.log(`No hay datos para actualizar para URL: ${url}`);
      return false;
    }
    
    // Agregar la condición WHERE
    values.push(url);
    
    // Debug: mostrar valores que se actualizarán
    console.log(`Actualizando ${url} con valores:`, data);
    
    // Construir y ejecutar la consulta SQL
    const query = `
      UPDATE businesses
      SET ${updateFields.join(', ')}
      WHERE url = ?
    `;
    
    const result = await db.run(query, values);
    
    // Verificar si se actualizó algún registro
    if (result.changes === 0) {
      console.warn(`No se encontró la URL ${url} para actualizar`);
      return false;
    }
    
    // Verificar específicamente el campo address si está presente
    if (data.address !== undefined) {
      // Consultar después de la actualización para verificar
      const updated = await db.get('SELECT address FROM businesses WHERE url = ?', [url]);
      console.log(`Verificación de dirección para ${url}:`, {
        direcciónAntesDeActualizar: data.address,
        direcciónDespuésDeActualizar: updated?.address
      });
    }
    
    return true;
  } catch (error) {
    console.error(`Error actualizando datos para URL ${url}:`, error);
    throw error;
  } finally {
    await db.close();
  }
}

// Obtener un negocio por URL
export async function getBusinessByUrl(url: string): Promise<any | null> {
  const db = await getDb();
  
  try {
    return await db.get('SELECT * FROM businesses WHERE url = ?', [url]);
  } finally {
    await db.close();
  }
}

// Obtener negocios filtrados
export async function getBusinesses({ 
  status, 
  limit = 50, 
  offset = 0,
  page
}: { 
  status?: 'pending' | 'processing' | 'completed' | 'error', 
  limit?: number, 
  offset?: number,
  page?: number 
} = {}): Promise<any[]> {
  const db = await getDb();
  
  try {
    let query = 'SELECT * FROM businesses';
    const params: any[] = [];
    
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    
    // Calcular el offset real basado en página si se proporciona
    let finalOffset = offset;
    if (page && page > 0) {
      finalOffset = (page - 1) * limit;
    }
    
    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, finalOffset);
    
    return await db.all(query, params);
  } finally {
    await db.close();
  }
}

// Obtener negocios filtrados para exportar (sin límite)
export async function getBusinessesForExport({ 
  sitemap_url 
}: { 
  sitemap_url?: string 
} = {}): Promise<any[]> {
  const db = await getDb();
  
  try {
    let query = 'SELECT url, sitemap_url, status, email, title, description, address, created_at, processed_at FROM businesses'; // Seleccionar columnas relevantes
    const params: any[] = [];
    
    if (sitemap_url) {
      query += ' WHERE sitemap_url = ?';
      params.push(sitemap_url);
    }
    
    query += ' ORDER BY created_at DESC'; // Ordenar para consistencia
    
    console.log(`Export Query: ${query}, Params: ${params}`); // Log para depuración
    return await db.all(query, params);
  } finally {
    await db.close();
  }
}

// Obtener estadísticas de negocios
export async function getBusinessStats(): Promise<{ 
  total: number, 
  pending: number, 
  processing: number, 
  completed: number, 
  error: number 
}> {
  const db = await getDb();
  
  try {
    const result = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
      FROM businesses
    `);
    
    return {
      total: result.total || 0,
      pending: result.pending || 0,
      processing: result.processing || 0,
      completed: result.completed || 0,
      error: result.error || 0
    };
  } finally {
    await db.close();
  }
}

// Borrar todos los negocios de la base de datos
export async function clearAllBusinesses(): Promise<void> {
  const db = await getDb();
  
  try {
    // Eliminar todos los registros de la tabla businesses
    await db.run('DELETE FROM businesses');
    console.log('Base de datos limpiada: todos los registros eliminados');
  } finally {
    await db.close();
  }
} 