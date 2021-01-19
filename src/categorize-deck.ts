import { MessageProcessor } from './message-processor';
import { ReviewMessage } from './review-message';

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	const messages: readonly ReviewMessage[] = event.Records.map(record => record.Sns.Message).map(msg =>
		JSON.parse(msg),
	);
	await new MessageProcessor().buildStats(messages);
	return { statusCode: 200, body: 'ok' };
};
