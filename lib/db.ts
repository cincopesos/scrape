import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import fs from 'fs';
import path from 'path';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database file path
const dbPath = path.join(dataDir, 'business_data.sqlite');

// Business data interface
export interface BusinessData {
  url: string;
  sitemap_url?: string;
  title?: string;
  description?: string;
  address?: string;
  email?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error_message?: string | null;
  created_at: string;
  processed_at?: string | null;
  updated_at: string;
}

// Database connection
let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

/**
 * Initialize the database connection and tables
 */
async function initializeDb() {
  if (db) return db;

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON');

  // Create business table if it doesn't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      url TEXT PRIMARY KEY,
      sitemap_url TEXT,
      title TEXT,
      description TEXT,
      address TEXT,
      email TEXT,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      created_at TEXT,
      processed_at TEXT,
      updated_at TEXT
    )
  `);

  // Create index for faster status-based queries
  await db.exec('CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status)');

  // Create scrape_sessions table if it doesn't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS scrape_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      total_urls INTEGER DEFAULT 0,
      processed_urls INTEGER DEFAULT 0,
      successful_urls INTEGER DEFAULT 0,
      failed_urls INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running'
    )
  `);

  return db;
}

/**
 * Add a new business URL to the database
 */
export async function addBusinessUrl(url: string, sitemapUrl: string): Promise<void> {
  const database = await initializeDb();
  const now = new Date().toISOString();
  
  await database.run(
    `INSERT OR IGNORE INTO businesses (url, sitemap_url, status, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?)`,
    [url, sitemapUrl, now, now]
  );
}

/**
 * Update business data in the database
 */
export async function updateBusinessData(url: string, data: Partial<BusinessData>): Promise<void> {
  const database = await initializeDb();
  const now = new Date().toISOString();
  
  // Build the SET clause dynamically based on provided data
  const updates: string[] = [];
  const values: any[] = [];
  
  Object.entries(data).forEach(([key, value]) => {
    updates.push(`${key} = ?`);
    values.push(value);
  });
  
  // Always update the updated_at timestamp
  updates.push('updated_at = ?');
  values.push(now);
  
  // Add URL as the last parameter for the WHERE clause
  values.push(url);
  
  await database.run(
    `UPDATE businesses SET ${updates.join(', ')} WHERE url = ?`,
    values
  );
}

/**
 * Get businesses from the database based on status
 */
export async function getBusinesses({ 
  status, 
  page = 1, 
  limit = 50 
}: { 
  status?: 'pending' | 'processing' | 'completed' | 'error'; 
  page?: number;
  limit?: number;
}): Promise<BusinessData[]> {
  const database = await initializeDb();
  const offset = (page - 1) * limit;
  
  let query = 'SELECT * FROM businesses';
  const params: any[] = [];
  
  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  return database.all(query, params);
}

/**
 * Get details for a specific business by URL
 */
export async function getBusinessDetails(url: string): Promise<BusinessData | null> {
  const database = await initializeDb();
  
  const result = await database.get('SELECT * FROM businesses WHERE url = ?', [url]);
  return result || null;
}

/**
 * Get statistics about processed businesses
 */
export async function getBusinessStats(): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  error: number;
}> {
  const database = await initializeDb();
  
  const total = await database.get('SELECT COUNT(*) as count FROM businesses');
  const pending = await database.get("SELECT COUNT(*) as count FROM businesses WHERE status = 'pending'");
  const processing = await database.get("SELECT COUNT(*) as count FROM businesses WHERE status = 'processing'");
  const completed = await database.get("SELECT COUNT(*) as count FROM businesses WHERE status = 'completed'");
  const error = await database.get("SELECT COUNT(*) as count FROM businesses WHERE status = 'error'");
  
  return {
    total: total?.count || 0,
    pending: pending?.count || 0,
    processing: processing?.count || 0,
    completed: completed?.count || 0,
    error: error?.count || 0,
  };
}

// Add scrape session
export async function addScrapeSession(sessionId: string): Promise<number> {
  const database = await initializeDb();
  
  const result = await database.run(
    `INSERT INTO scrape_sessions (session_id, start_time, status) VALUES (?, DATETIME('now'), 'running')`,
    [sessionId]
  );
  
  return result.lastID || 0;
}

// Update scrape session stats
export async function updateScrapeSessionStats(
  sessionId: string, 
  stats: { 
    total_urls?: number; 
    processed_urls?: number; 
    successful_urls?: number; 
    failed_urls?: number; 
    status?: string;
  }
): Promise<boolean> {
  const database = await initializeDb();
  
  let query = `UPDATE scrape_sessions SET `;
  const params: any[] = [];
  
  if (stats.total_urls !== undefined) {
    query += `total_urls = ?, `;
    params.push(stats.total_urls);
  }
  
  if (stats.processed_urls !== undefined) {
    query += `processed_urls = ?, `;
    params.push(stats.processed_urls);
  }
  
  if (stats.successful_urls !== undefined) {
    query += `successful_urls = ?, `;
    params.push(stats.successful_urls);
  }
  
  if (stats.failed_urls !== undefined) {
    query += `failed_urls = ?, `;
    params.push(stats.failed_urls);
  }
  
  if (stats.status !== undefined) {
    query += `status = ?, `;
    params.push(stats.status);
    
    if (stats.status === 'completed' || stats.status === 'error') {
      query += `end_time = DATETIME('now'), `;
    }
  }
  
  // Remove trailing comma and space
  query = query.slice(0, -2);
  
  query += ` WHERE session_id = ?`;
  params.push(sessionId);
  
  const result = await database.run(query, params);
  
  return (result.changes || 0) > 0;
}

// Get latest scrape session
export async function getLatestScrapeSession(): Promise<any> {
  const database = await initializeDb();
  
  return await database.get(`
    SELECT * FROM scrape_sessions 
    ORDER BY start_time DESC 
    LIMIT 1
  `);
}

// Search businesses
export async function searchBusinesses(searchTerm: string): Promise<BusinessData[]> {
  const database = await initializeDb();
  
  return await database.all(
    `SELECT * FROM businesses 
     WHERE url LIKE ? OR title LIKE ? OR description LIKE ? OR address LIKE ? OR email LIKE ?
     ORDER BY updated_at DESC LIMIT 100`,
    [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
  );
} 