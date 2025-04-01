import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = await getDb();
    try {
      // Consultar todos los sitemaps únicos que no sean nulos
      const sitemapsQuery = `
        SELECT DISTINCT sitemap_url 
        FROM businesses 
        WHERE sitemap_url IS NOT NULL
        ORDER BY sitemap_url
      `;
      
      const sitemapsResult = await db.all(sitemapsQuery);
      
      // Extraer los valores de la columna sitemap_url
      const sitemaps = sitemapsResult.map((row: any) => row.sitemap_url);
      
      // Contar URLs por sitemap
      const statsQuery = `
        SELECT 
          sitemap_url,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
          SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) as with_email,
          MAX(created_at) as last_added
        FROM businesses
        WHERE sitemap_url IS NOT NULL
        GROUP BY sitemap_url
        ORDER BY last_added DESC
      `;
      
      const statsResult = await db.all(statsQuery);
      
      return NextResponse.json({
        sitemaps,
        stats: statsResult
      });
      
    } finally {
      if (db) {
        await db.close();
      }
    }
  } catch (error) {
    console.error('Error obteniendo sitemaps:', error);
    return NextResponse.json(
      { error: 'Error al obtener sitemaps', details: String(error) },
      { status: 500 }
    );
  }
} 