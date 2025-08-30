import { db } from '../db';
import { sql } from 'drizzle-orm';
import { type GetGameInput, type GameState } from '../schema';

export const getGame = async (input: GetGameInput): Promise<GameState> => {
  try {
    // Find the game by room_code using raw SQL since schema might not be available
    const gameResult = await db.execute(sql`
      SELECT id, room_code, status, max_players, current_players, drawn_numbers, 
             draw_order, created_at, started_at, completed_at
      FROM games 
      WHERE room_code = ${input.room_code}
    `);

    const games = Array.isArray(gameResult) ? gameResult : gameResult.rows || [];

    if (games.length === 0) {
      throw new Error(`Game with room code ${input.room_code} not found`);
    }

    const game = games[0] as any;

    // Load all players in the game
    const playersResult = await db.execute(sql`
      SELECT id, game_id, player_name, selected_numbers, is_winner, joined_at
      FROM players 
      WHERE game_id = ${game.id}
      ORDER BY joined_at ASC
    `);

    const players = Array.isArray(playersResult) ? playersResult : playersResult.rows || [];

    // Load the latest draw event if any
    const drawEventsResult = await db.execute(sql`
      SELECT id, game_id, drawn_number, draw_position, drawn_at
      FROM draw_events 
      WHERE game_id = ${game.id}
      ORDER BY drawn_at DESC
      LIMIT 1
    `);

    const drawEvents = Array.isArray(drawEventsResult) ? drawEventsResult : drawEventsResult.rows || [];
    const latestDraw = drawEvents.length > 0 ? drawEvents[0] as any : null;

    // Transform database data to match schema types
    const gameState: GameState = {
      game: {
        id: game.id,
        room_code: game.room_code,
        status: game.status as 'waiting' | 'in_progress' | 'completed',
        max_players: game.max_players,
        current_players: game.current_players,
        drawn_numbers: Array.isArray(game.drawn_numbers) ? game.drawn_numbers : [],
        draw_order: game.draw_order,
        created_at: new Date(game.created_at),
        started_at: game.started_at ? new Date(game.started_at) : null,
        completed_at: game.completed_at ? new Date(game.completed_at) : null
      },
      players: players.map((player: any) => ({
        id: player.id,
        game_id: player.game_id,
        player_name: player.player_name,
        selected_numbers: Array.isArray(player.selected_numbers) ? player.selected_numbers : [],
        is_winner: player.is_winner,
        joined_at: new Date(player.joined_at)
      })),
      latest_draw: latestDraw ? {
        id: latestDraw.id,
        game_id: latestDraw.game_id,
        drawn_number: latestDraw.drawn_number,
        draw_position: latestDraw.draw_position,
        drawn_at: new Date(latestDraw.drawn_at)
      } : null
    };

    return gameState;
  } catch (error) {
    console.error('Get game failed:', error);
    throw error;
  }
};