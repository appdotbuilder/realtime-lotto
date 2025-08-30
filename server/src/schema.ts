import { z } from 'zod';

// Game status enum
export const gameStatusSchema = z.enum(['waiting', 'in_progress', 'completed']);
export type GameStatus = z.infer<typeof gameStatusSchema>;

// Player selection schema - exactly 5 unique numbers from 1-50
export const playerSelectionSchema = z.array(z.number().min(1).max(50)).length(5).refine(
  (numbers) => new Set(numbers).size === numbers.length,
  { message: "Numbers must be unique" }
);

// Game schema
export const gameSchema = z.object({
  id: z.number(),
  room_code: z.string(),
  status: gameStatusSchema,
  max_players: z.number().int().positive(),
  current_players: z.number().int().nonnegative(),
  drawn_numbers: z.array(z.number().min(1).max(50)),
  draw_order: z.number().int().nonnegative(),
  created_at: z.coerce.date(),
  started_at: z.coerce.date().nullable(),
  completed_at: z.coerce.date().nullable()
});

export type Game = z.infer<typeof gameSchema>;

// Player schema
export const playerSchema = z.object({
  id: z.number(),
  game_id: z.number(),
  player_name: z.string(),
  selected_numbers: z.array(z.number().min(1).max(50)),
  is_winner: z.boolean(),
  joined_at: z.coerce.date()
});

export type Player = z.infer<typeof playerSchema>;

// Draw event schema for real-time updates
export const drawEventSchema = z.object({
  id: z.number(),
  game_id: z.number(),
  drawn_number: z.number().min(1).max(50),
  draw_position: z.number().int().min(1).max(5),
  drawn_at: z.coerce.date()
});

export type DrawEvent = z.infer<typeof drawEventSchema>;

// Input schemas for API operations

// Create game input
export const createGameInputSchema = z.object({
  room_code: z.string().min(4).max(10).regex(/^[A-Z0-9]+$/, "Room code must contain only uppercase letters and numbers"),
  max_players: z.number().int().min(2).max(50).default(10)
});

export type CreateGameInput = z.infer<typeof createGameInputSchema>;

// Join game input
export const joinGameInputSchema = z.object({
  room_code: z.string(),
  player_name: z.string().min(1).max(50),
  selected_numbers: playerSelectionSchema
});

export type JoinGameInput = z.infer<typeof joinGameInputSchema>;

// Start game input
export const startGameInputSchema = z.object({
  room_code: z.string()
});

export type StartGameInput = z.infer<typeof startGameInputSchema>;

// Get game input
export const getGameInputSchema = z.object({
  room_code: z.string()
});

export type GetGameInput = z.infer<typeof getGameInputSchema>;

// Game state response for real-time updates
export const gameStateSchema = z.object({
  game: gameSchema,
  players: z.array(playerSchema),
  latest_draw: drawEventSchema.nullable()
});

export type GameState = z.infer<typeof gameStateSchema>;

// Real-time event types
export const realtimeEventTypeSchema = z.enum([
  'player_joined',
  'game_started',
  'number_drawn',
  'game_completed',
  'winners_announced'
]);

export type RealtimeEventType = z.infer<typeof realtimeEventTypeSchema>;

export const realtimeEventSchema = z.object({
  type: realtimeEventTypeSchema,
  game_id: z.number(),
  room_code: z.string(),
  data: z.any(), // Flexible data payload for different event types
  timestamp: z.coerce.date()
});

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

// Additional input schemas for internal operations
export const drawNumberInputSchema = z.object({
  gameId: z.number()
});

export type DrawNumberInput = z.infer<typeof drawNumberInputSchema>;

export const checkWinnersInputSchema = z.object({
  gameId: z.number()
});

export type CheckWinnersInput = z.infer<typeof checkWinnersInputSchema>;

export const leaveGameInputSchema = z.object({
  gameId: z.number(),
  playerId: z.number()
});

export type LeaveGameInput = z.infer<typeof leaveGameInputSchema>;