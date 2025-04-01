import { NextRequest, NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

async function getDb(): Promise<Database> {
  return open({
    filename: path.join(process.cwd(), 'data', 'business_data.sqlite'),
    driver: sqlite3.Database
  });
}

export async function GET(request: NextRequest) {
  try {
    const db = await getDb();
    
    // Obtener estadísticas de emails
    const emailStats = await db.get(`
      SELECT COUNT(*) as count
      FROM businesses
      WHERE email IS NOT NULL AND email != ''
    `);
    
    // Obtener estadísticas de descripciones
    const descriptionStats = await db.get(`
      SELECT COUNT(*) as count
      FROM businesses
      WHERE description IS NOT NULL AND description != ''
    `);
    
    // Obtener estadísticas de direcciones
    const addressStats = await db.get(`
      SELECT COUNT(*) as count
      FROM businesses
      WHERE address IS NOT NULL AND address != ''
    `);
    
    // Obtener estadísticas de sitemaps
    const sitemapStats = await db.all(`
      SELECT sitemap_url, COUNT(*) as count
      FROM businesses
      WHERE sitemap_url IS NOT NULL
      GROUP BY sitemap_url
      ORDER BY count DESC
      LIMIT 10
    `);
    
    // Obtener estadísticas de estado
    const statusStats = await db.all(`
      SELECT status, COUNT(*) as count
      FROM businesses
      GROUP BY status
    `);
    
    // Obtener URLs procesadas recientemente
    const recentProcessed = await db.all(`
      SELECT url, title, email, status, processed_at
      FROM businesses
      WHERE processed_at IS NOT NULL
      ORDER BY processed_at DESC
      LIMIT 10
    `);
    
    // Cerrar la conexión a la base de datos
    await db.close();
    
    return NextResponse.json({
      emailCount: emailStats.count,
      descriptionCount: descriptionStats.count,
      addressCount: addressStats.count,
      sitemapStats,
      statusStats,
      recentProcessed
    });
    
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    return NextResponse.json(
      { error: 'Error al obtener estadísticas' },
      { status: 500 }
    );
  }
} 