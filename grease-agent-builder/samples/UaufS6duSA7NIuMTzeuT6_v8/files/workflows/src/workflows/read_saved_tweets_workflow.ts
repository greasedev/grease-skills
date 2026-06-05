/**
 * ---
 * name: Read Saved Tweets
 * description: "Query tweets saved in local database with optional filters"
 *
 * use when:
 * - User wants to view tweets saved from X.com lists
 * - User needs to search tweets by keyword or date range
 * - User wants to filter tweets by interest area or author
 *
 * input:
 * - name: startDate
 *   description: Optional start date filter (ISO format, e.g., 2024-01-01)
 *   required: false
 * - name: endDate
 *   description: Optional end date filter (ISO format, e.g., 2024-12-31)
 *   required: false
 * - name: keyword
 *   description: Optional keyword to search in tweet text, author name, or hashtags
 *   required: false
 * - name: interest
 *   description: Optional interest area to filter tweets
 *   required: false
 * - name: author
 *   description: Optional author handle to filter tweets (e.g., @elonmusk)
 *   required: false
 * - name: limit
 *   description: Maximum number of tweets to return (default 100, max 100)
 *   required: false
 *
 * output:
 * - success: bool
 * - message: string
 * - data: tweets array with count and filters applied
 * ---
 */

import { Agent, type WorkflowContext } from '@greaseclaw/workflow-sdk';
import { querySavedTweets, type QueryTweetsOptions, type SavedTweet } from '../shared';

export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const params = context.params || {};
  const chatId = context.chatId;

  const options: QueryTweetsOptions = {
    startDate: typeof params.startDate === 'string' ? params.startDate : undefined,
    endDate: typeof params.endDate === 'string' ? params.endDate : undefined,
    keyword: typeof params.keyword === 'string' ? params.keyword : undefined,
    interest: typeof params.interest === 'string' ? params.interest : undefined,
    author: typeof params.author === 'string' ? params.author : undefined,
    limit: typeof params.limit === 'number' ? Math.min(100, params.limit) : 100,
  };

  const tweets = await querySavedTweets(agent, options);

  // Format response
  const filtersApplied = [
    options.startDate && `start: ${options.startDate}`,
    options.endDate && `end: ${options.endDate}`,
    options.keyword && `keyword: "${options.keyword}"`,
    options.interest && `interest: ${options.interest}`,
    options.author && `author: ${options.author}`,
  ].filter(Boolean);

  const message = filtersApplied.length
    ? `Found ${tweets.length} tweet(s) with filters: ${filtersApplied.join(', ')}`
    : `Found ${tweets.length} tweet(s)`;

  // Send summary to chat if available
  if (chatId) {
    const pageLink = agent.getPageLink('tweets', { interest: options.interest || '' });
    const summary = `${message}\n\n查看 Tweets 详情：${pageLink}`;
    await agent.sendText(chatId, '查询 Tweets 完成', summary);
  }

  return {
    success: true,
    message,
    data: {
      count: tweets.length,
      filters: filtersApplied,
      tweets: tweets.map(formatTweet),
    },
  };
}

function formatTweet(tweet: SavedTweet) {
  return {
    id: tweet.id,
    author: tweet.author,
    authorName: tweet.authorName,
    authorVerified: tweet.authorVerified,
    text: tweet.text?.slice(0, 500) || '',
    url: tweet.url,
    likes: tweet.likes || 0,
    retweets: tweet.retweets || 0,
    createdAt: tweet.createdAt || '',
    hashtags: tweet.hashtags || [],
    listNames: tweet.listNames || [],
  };
}

// @ts-ignore
globalThis.execute = execute;