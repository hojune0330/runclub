import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Calmcode は OpenAI 互換の API を提供します
// カスタムベースURLでプロバイダを初期化
const calmcode = createOpenAI({
  baseURL: 'https://api.calmcode.ai/v1',
  apiKey: process.env.CALMCODE_API_KEY ?? process.env.OPENAI_API_KEY,
});

// ストリーミングレスポンスの最大継続時間: 30秒
export const maxDuration = 30;

export async function POST(req: Request) {
  // リクエストボディからメッセージ履歴を抽出
  const { messages } = await req.json();

  // Calmcode 経由で GPT-4o mini モデルを呼び出し
  const result = streamText({
    model: calmcode('gpt-4o-mini'),
    messages,
  });

  // ストリーミングレスポンスとして返す
  return result.toDataStreamResponse();
}
