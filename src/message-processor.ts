/* eslint-disable @typescript-eslint/no-use-before-define */
import SqlString from 'sqlstring';
import { assignArchetype } from './archetype-service';
import { getConnection } from './db/rds';
import { ReviewMessage } from './review-message';

export class MessageProcessor {
	public async buildStats(messages: readonly ReviewMessage[]): Promise<void> {
		await Promise.all(messages.map(msg => this.buildStat(msg)));
	}

	private async buildStat(message: ReviewMessage): Promise<void> {
		console.log('processing message', message);
		const { playerArchetypeId, opponentArchetypeId } = await assignArchetype(message);
		if (!playerArchetypeId || !message.playerDecklist) {
			return;
		}

		const [playerRank, playerLegendRank] = convertLeagueToRank(message.playerRank);

		const escape = SqlString.escape;
		const creationDate = formatDate(new Date());
		const query = `
			INSERT INTO ranked_decks
			(
				reviewId,
				creationDate,
				gameFormat,
				playerDeckstring,
				playerArchetypeId,
				opponentArchetypeId,
				result,
				rank,
				legendRank
			)
			VALUES (
				${escape(message.reviewId)},
				${escape(creationDate)},
				${escape(message.gameFormat)},
				${escape(message.playerDecklist)},
				${escape(playerArchetypeId)},
				${escape(opponentArchetypeId)},
				${escape(message.result)},
				${escape(playerRank)},
				${escape(playerLegendRank)}
			)
		`;
		const mysql = await getConnection();
		console.log('running query', query);
		await mysql.query(query);
		mysql.end();
	}
}

const formatDate = (today: Date): string => {
	return `${today
		.toISOString()
		.slice(0, 19)
		.replace('T', ' ')}.${today.getMilliseconds()}`;
};

const convertLeagueToRank = (playerRank: string): [number, number] => {
	if (!playerRank || playerRank === '-1--1') {
		return [null, 0];
	}
	if (playerRank.indexOf('legend-') !== -1) {
		return [51, parseInt(playerRank.split('legend-')[1])];
	}
	if (playerRank.indexOf('-') === -1) {
		console.log('cant parse rank', playerRank);
		return [null, 0];
	}
	const league = (5 - parseInt(playerRank.split('-')[0])) * 10;
	const rank = 10 - parseInt(playerRank.split('-')[1]) + 1;
	return [league + rank, 0];
};
