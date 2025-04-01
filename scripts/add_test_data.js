// Script para añadir datos de prueba a la base de datos
// Ejecutar con: node scripts/add_test_data.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ruta a la base de datos
const dbPath = path.join(process.cwd(), 'data', 'business_data.sqlite');

// Verificar que la base de datos existe
if (!fs.existsSync(dbPath)) {
  console.error(`La base de datos no existe en: ${dbPath}`);
  process.exit(1);
}

// Conectar a la base de datos
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(`Error al conectar a la base de datos: ${err.message}`);
    process.exit(1);
  }
  console.log('Conectado a la base de datos SQLite');
});

// Datos de ejemplo para tres sitemaps diferentes
const sitemaps = [
  {
    url: 'https://ejemplo1.com/sitemap.xml',
    urls: [
      { url: 'https://ejemplo1.com/producto1/', title: 'Producto 1', email: 'contacto@ejemplo1.com', status: 'completed' },
      { url: 'https://ejemplo1.com/producto2/', title: 'Producto 2', email: null, status: 'error', error_message: 'No se encontró correo' },
      { url: 'https://ejemplo1.com/producto3/', title: 'Producto 3', email: 'ventas@ejemplo1.com', status: 'completed' },
      { url: 'https://ejemplo1.com/producto4/', title: null, email: null, status: 'pending' }
    ]
  },
  {
    url: 'https://ejemplo2.com/sitemap.xml',
    urls: [
      { url: 'https://tienda1.ejemplo2.com/', title: 'Tienda 1', email: 'info@tienda1.com', status: 'completed' },
      { url: 'https://tienda2.ejemplo2.com/', title: 'Tienda 2', email: 'ventas@tienda2.com', status: 'completed' },
      { url: 'https://tienda3.ejemplo2.com/', title: 'Tienda 3', email: null, status: 'error', error_message: 'Timeout al procesar' }
    ]
  },
  {
    url: 'https://ueniweb.com/sitemap-1.xml',
    urls: [
      { url: 'https://nalaky-s.ueniweb.com/', title: 'Nalaky Store', email: 'info@nalaky.com', status: 'completed' },
      { url: 'https://euphoricinkstudio.us/', title: 'Euphoric Ink Studio', email: 'contact@euphoricink.us', status: 'completed' },
      { url: 'https://brz-beats.ueniweb.com/', title: 'BRZ Beats', email: null, status: 'error', error_message: 'Error de conexión' },
      { url: 'https://smart-beauty.ueniweb.com/', title: 'Smart Beauty', email: 'appointments@smart-beauty.com', status: 'completed' },
      { url: 'https://ajgproducts.ueniweb.com/', title: 'AJG Products', email: 'sales@ajgproducts.com', status: 'completed' },
      { url: 'https://junknmadness.com/', title: 'Junk and Madness', email: null, status: 'pending' },
      { url: 'https://sarassculpting.com/', title: 'Sara\'s Sculpting', email: null, status: 'processing' }
    ]
  }
];

// Función para agregar un sitemap y sus URLs a la base de datos
function addSitemapData(sitemap) {
  return new Promise((resolve, reject) => {
    console.log(`\nAgregando datos para el sitemap: ${sitemap.url}`);
    
    // Comenzar una transacción
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Insertar cada URL
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO businesses 
        (url, sitemap_url, title, email, status, error_message, created_at, processed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      
      sitemap.urls.forEach(url => {
        stmt.run(
          url.url,
          sitemap.url,
          url.title,
          url.email,
          url.status,
          url.error_message || null,
          (err) => {
            if (err) {
              console.error(`Error al insertar ${url.url}: ${err.message}`);
            } else {
              console.log(`Insertado: ${url.url}`);
            }
          }
        );
      });
      
      stmt.finalize();
      
      db.run('COMMIT', (err) => {
        if (err) {
          console.error(`Error en la transacción: ${err.message}`);
          reject(err);
        } else {
          console.log(`Datos del sitemap ${sitemap.url} insertados correctamente`);
          resolve();
        }
      });
    });
  });
}

// Función principal asíncrona
async function main() {
  try {
    // Verificar cuántos registros ya existen
    const countBefore = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM businesses', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    console.log(`La base de datos contiene ${countBefore} registros antes de la inserción`);
    
    // Procesar cada sitemap
    for (const sitemap of sitemaps) {
      await addSitemapData(sitemap);
    }
    
    // Verificar cuántos registros hay después
    const countAfter = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM businesses', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    console.log(`\nLa base de datos contiene ${countAfter} registros después de la inserción`);
    console.log(`Se agregaron ${countAfter - countBefore} registros nuevos`);
    
    // Cerrar la conexión
    db.close((err) => {
      if (err) {
        console.error(`Error al cerrar la base de datos: ${err.message}`);
      } else {
        console.log('Conexión a la base de datos cerrada');
      }
    });
    
  } catch (error) {
    console.error('Error en el script:', error);
    db.close();
  }
}

// Ejecutar el script
main(); 