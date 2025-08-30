import { db } from '../db';
import { type Player, type CheckWinnersInput } from '../schema';
import { sql } from 'drizzle-orm';

export const checkWinners = async (input: CheckWinnersInput | number): Promise<Player[]> => {
  try {
    // Handle both input formats for backward compatibility
    const gameId = typeof input === 'number' ? input : input.gameId;

    // 1. Find the game by ID and ensure it has 5 drawn numbers
    const gameResult = await db.execute(sql`
      SELECT id, room_code, status, max_players, current_players, drawn_numbers, draw_order, created_at, started_at, completed_at
      FROM games 
      WHERE id = ${gameId}
    `);

    if (gameResult.rows.length === 0) {
      throw new Error(`Game with ID ${gameId} not found`);
    }

    const game = gameResult.rows[0] as any;

    // Parse JSON field
    const drawnNumbers = Array.isArray(game.drawn_numbers) ? game.drawn_numbers : JSON.parse(game.drawn_numbers || '[]');

    // Ensure game has exactly 5 drawn numbers
    if (!Array.isArray(drawnNumbers) || drawnNumbers.length !== 5) {
      throw new Error(`Game ${gameId} does not have exactly 5 drawn numbers`);
    }

    // 2. Load all players for the game
    const playersResult = await db.execute(sql`
      SELECT id, game_id, player_name, selected_numbers, is_winner, joined_at
      FROM players 
      WHERE game_id = ${gameId}
    `);

    const players = playersResult.rows as any[];

    // 3. Compare each player's selected_numbers with drawn_numbers
    // 4. Find exact matches (all 5 numbers match in any order)
    const winners: Player[] = [];
    const drawnNumbersSet = new Set(drawnNumbers);

    for (const player of players) {
      // Parse selected numbers JSON
      const selectedNumbers = Array.isArray(player.selected_numbers) 
        ? player.selected_numbers 
        : JSON.parse(player.selected_numbers || '[]');

      if (!Array.isArray(selectedNumbers) || selectedNumbers.length !== 5) {
        continue; // Skip players with invalid selections
      }

      // Check if all player's numbers are in the drawn numbers
      const hasAllNumbers = selectedNumbers.every((num: number) => drawnNumbersSet.has(num));

      if (hasAllNumbers) {
        // 5. Update is_winner flag for winning players
        await db.execute(sql`
          UPDATE players 
          SET is_winner = true 
          WHERE id = ${player.id}
        `);

        winners.push({
          id: player.id,
          game_id: player.game_id,
          player_name: player.player_name,
          selected_numbers: selectedNumbers,
          is_winner: true,
          joined_at: new Date(player.joined_at)
        });
      }
    }

    // 6. Update game status to 'completed' and set completed_at timestamp
    await db.execute(sql`
      UPDATE games 
      SET status = 'completed', completed_at = NOW() 
      WHERE id = ${gameId}
    `);

    // 7. Emit real-time event announcing winners
    // Note: Real-time event emission would typically be handled by a separate service
    // For now, we'll log the event (in a real app, this might publish to a message queue)
    console.log('Winners announced for game', gameId, ':', winners.map(w => w.player_name));

    // 8. Return array of winning players
    return winners;
  } catch (error) {
    console.error('Check winners failed:', error);
    throw error;
  }
};