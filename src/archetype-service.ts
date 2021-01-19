import { parseHsReplayString, Replay } from '@firestone-hs/hs-replay-xml-parser/dist/public-api';
import { AllCardsService } from '@firestone-hs/reference-data';
import { decode } from 'deckstrings';
import { S3 } from './db/s3';
import { http } from './db/utils';
import { extractPlayedCards } from './played-card-extractor';
import { ReviewMessage } from './review-message';

const allCards = new AllCardsService();
allCards.initializeCardsDb();

const s3 = new S3();

export interface ArchetypeConfig {
	readonly class: string;
	readonly archetype: string;
	readonly cardId: string;
	readonly points: number;
	readonly gameFormat: 'standard' | 'wild';
}

interface ArchetypeScore {
	readonly archetypeId: string;
	readonly points: number;
}

export const assignArchetype = async (
	message: ReviewMessage,
): Promise<{ playerArchetypeId: string; opponentArchetypeId: string }> => {
	const data: readonly ArchetypeConfig[] = await getDeckIds();
	console.log('deckIds', data);

	// player archetype
	const deckstring = message.playerDecklist;
	console.log('getting deck ids', deckstring);
	const { cards, playerClass, format } = explodeDeckstring(deckstring);
	console.log('deck data', cards, playerClass, format);
	const playerArchetypeId = assignArchetypeId(data, cards, playerClass, format);

	// opponent archetype
	const replayString = await s3.readZippedContent('xml.firestoneapp.com', message.replayKey);
	const replay: Replay = parseHsReplayString(replayString);
	const opponentPlayedCards = extractPlayedCards(replay, message, replay.opponentPlayerId);
	const opponentArchetypeId = assignArchetypeId(data, opponentPlayedCards, message.opponentClass, format);

	return {
		playerArchetypeId: playerArchetypeId,
		opponentArchetypeId: opponentArchetypeId,
	};
};

export const assignArchetypeId = (
	data: readonly ArchetypeConfig[],
	cards: readonly string[],
	playerClass: string,
	format: 'standard' | 'wild',
): string => {
	const scores: readonly ArchetypeScore[] = assignScores(data, cards, playerClass, format);
	if (!scores.length) {
		console.warn('Could not assign archetype', cards, playerClass, format, data);
		return null;
	}
	console.log('scores', JSON.stringify(scores, null, 4));
	const result = [...scores].sort((a, b) => b.points - a.points)[0];
	console.log('found', result);
	return result.archetypeId;
};

const assignScores = (
	data: readonly ArchetypeConfig[],
	cards: readonly string[],
	playerClass: string,
	format: 'standard' | 'wild',
): readonly ArchetypeScore[] => {
	const relevantData = data
		.filter(dataPoint => dataPoint.class === playerClass)
		.filter(dataPoint => dataPoint.gameFormat === format);
	const possibleArchetypes = [...new Set(relevantData.map(dataPoint => dataPoint.archetype))];
	return possibleArchetypes.map(
		archetypeId =>
			({
				archetypeId: playerClass + '_' + archetypeId,
				points: assignPoints(
					cards,
					relevantData.filter(data => data.archetype === archetypeId),
				),
			} as ArchetypeScore),
	);
};

const assignPoints = (cards: readonly string[], relevantData: readonly ArchetypeConfig[]): number => {
	return cards
		.map(cardId => relevantData.find(data => data.cardId === cardId))
		.filter(data => data)
		.map(data => data.points)
		.reduce((a, b) => a + b, 0);
};

const getDeckIds = async (): Promise<readonly ArchetypeConfig[]> => {
	const cardsStr = await http(`https://static.zerotoheroes.com/api/decks-config.json`);
	return JSON.parse(cardsStr);
};

const explodeDeckstring = (
	deckstring: string,
): { cards: readonly string[]; playerClass: string; format: 'standard' | 'wild' } => {
	const deck = decode(deckstring);
	const deckCards: readonly string[] = deck.cards
		.map(cards => Array(cards[1]).fill(cards[0]))
		.reduce((a, b) => a.concat(b), [])
		.map(dbfId => allCards.getCardFromDbfId(dbfId)?.id)
		.filter(cardId => cardId);
	const playerClass = deck.heroes?.length
		? allCards.getCardFromDbfId(deck.heroes[0])?.playerClass?.toLowerCase()
		: null;
	const format = deck.format === 1 ? 'wild' : 'standard';
	return {
		cards: deckCards,
		playerClass: playerClass,
		format: format,
	};
};
