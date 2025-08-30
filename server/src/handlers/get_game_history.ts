import { db } from '../db';
import { sql } from 'drizzle-orm';
import { type Game } from '../schema';

export async function getGameHistory(): Promise<Game[]> {
  try {
    // Query all games with status 'completed' using raw SQL
    // Order by completed_at descending and limit results for performance
    const results = await db.execute(sql`
      SELECT 
        id,
        room_code,
        status,
        max_players,
        current_players,
        drawn_numbers,
        draw_order,
        created_at,
        started_at,
        completed_at
      FROM games 
      WHERE status = 'completed'
      ORDER BY completed_at DESC 
      LIMIT 100
    `);

    // Transform the database results to match the Game schema
    return results.rows.map((row: any) => ({
      id: row.id,
      room_code: row.room_code,
      status: row.status,
      max_players: row.max_players,
      current_players: row.current_players,
      drawn_numbers: row.drawn_numbers || [],
      draw_order: row.draw_order,
      created_at: new Date(row.created_at),
      started_at: row.started_at ? new Date(row.started_at) : null,
      completed_at: row.completed_at ? new Date(row.completed_at) : null
    }));
  } catch (error) {
    console.error('Failed to fetch game history:', error);
    throw error;
  }
}