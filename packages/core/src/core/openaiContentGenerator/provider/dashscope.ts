import OpenAI from 'openai';
import type { Config } from '../../../config/config.js';
import type { ContentGeneratorConfig } from '../../contentGenerator.js';
import { AuthType } from '../../contentGenerator.js';
import { DEFAULT_TIMEOUT, DEFAULT_MAX_RETRIES } from '../constants.js';
import { tokenLimit } from '../../tokenLimits.js';
import type {
  OpenAICompatibleProvider,
  DashScopeRequestMetadata,
  ChatCompletionContentPartTextWithCache,
  ChatCompletionContentPartWithCache,
  ChatCompletionToolWithCache,
} from './types.js';
import { InputLengthExceededError } from '../../../qwen/errors.js';

export class DashScopeOpenAICompatibleProvider
  implements OpenAICompatibleProvider
{
  private contentGeneratorConfig: ContentGeneratorConfig;
  private cliConfig: Config;

  constructor(
    contentGeneratorConfig: ContentGeneratorConfig,
    cliConfig: Config,
  ) {
    this.cliConfig = cliConfig;
    this.contentGeneratorConfig = contentGeneratorConfig;
  }

  static isDashScopeProvider(
    contentGeneratorConfig: ContentGeneratorConfig,
  ): boolean {
    const authType = contentGeneratorConfig.authType;
    const baseUrl = contentGeneratorConfig.baseUrl;
    return (
      authType === AuthType.QWEN_OAUTH ||
      baseUrl === 'https://dashscope.aliyuncs.com/compatible-mode/v1' ||
      baseUrl === 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
    );
  }

  buildHeaders(): Record<string, string | undefined> {
    const version = this.cliConfig.getCliVersion() || 'unknown';
    const userAgent = `QwenCode/${version} (${process.platform}; ${process.arch})`;
    const { authType } = this.contentGeneratorConfig;
    return {
      'User-Agent': userAgent,
      'X-DashScope-CacheControl': 'enable',
      'X-DashScope-UserAgent': userAgent,
      'X-DashScope-AuthType': authType,
    };
  }

  buildClient(): OpenAI {
    const {
      apiKey,
      baseUrl,
      timeout = DEFAULT_TIMEOUT,
      maxRetries = DEFAULT_MAX_RETRIES,
    } = this.contentGeneratorConfig;
    const defaultHeaders = this.buildHeaders();
    return new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout,
      maxRetries,
      defaultHeaders,
    });
  }

  /**
   * Build and configure the request for DashScope API.
   *
   * This method applies DashScope-specific configurations including:
   * - Cache control for the system message, last tool message (when tools are configured),
   *   and the latest history message
   * - Output token limits based on model capabilities
   * - Vision model specific parameters (vl_high_resolution_images)
   * - Request metadata for session tracking
   *
   * @param request - The original chat completion request parameters
   * @param userPromptId - Unique identifier for the user prompt for session tracking
   * @returns Configured request with DashScope-specific parameters applied
   */
  buildRequest(
    request: OpenAI.Chat.ChatCompletionCreateParams,
    userPromptId: string,
  ): OpenAI.Chat.ChatCompletionCreateParams {
    // Check input length before processing
    this.checkInputLength(request, request.model);

    let messages = request.messages;
    let tools = request.tools;

    // Apply DashScope cache control only if not disabled
    if (!this.shouldDisableCacheControl()) {
      const { messages: updatedMessages, tools: updatedTools } =
        this.addDashScopeCacheControl(
          request,
          request.stream ? 'all' : 'system_only',
        );
      messages = updatedMessages;
      tools = updatedTools;
    }

    // Apply output token limits based on model capabilities
    // This ensures max_tokens doesn't exceed the model's maximum output limit
    const requestWithTokenLimits = this.applyOutputTokenLimit(
      request,
      request.model,
    );

    if (this.isVisionModel(request.model)) {
      return {
        ...requestWithTokenLimits,
        messages,
        ...(tools ? { tools } : {}),
        ...(this.buildMetadata(userPromptId) || {}),
        /* @ts-expect-error dashscope exclusive */
        vl_high_resolution_images: true,
      } as OpenAI.Chat.ChatCompletionCreateParams;
    }

    return {
      ...requestWithTokenLimits, // Preserve all original parameters including sampling params and adjusted max_tokens
      messages,
      ...(tools ? { tools } : {}),
      ...(this.buildMetadata(userPromptId) || {}),
    } as OpenAI.Chat.ChatCompletionCreateParams;
  }

  /**
   * Check if the input length exceeds DashScope API limits.
   * 
   * @param request - The chat completion request parameters
   * @param model - The model name to get the input token limit for
   * @throws InputLengthExceededError if input length exceeds the limit
   */
  private checkInputLength(
    request: OpenAI.Chat.ChatCompletionCreateParams,
    model: string,
  ): void {
    // Get the input token limit for the model (1M tokens for most Qwen models)
    const inputTokenLimit = tokenLimit(model, 'input');
    
    // For now, we'll use a simple estimation based on character count
    // In the future, we should implement a more accurate token counting mechanism
    const content = JSON.stringify(request.messages);
    const estimatedTokens = Math.ceil(content.length / 4); // Rough estimate: 1 token ≈ 4 characters
    
    // Check if estimated tokens exceed the limit
    if (estimatedTokens > inputTokenLimit) {
      throw new InputLengthExceededError(inputTokenLimit, estimatedTokens);
    }
  }

  buildMetadata(userPromptId: string): DashScopeRequestMetadata {
    return {
      metadata: {
        sessionId: this.cliConfig.getSessionId?.(),
        promptId: userPromptId,
      },
    };
  }

  /**
   * Add cache control flag to specified message(s) for DashScope providers
   */
  private addDashScopeCacheControl(
    request: OpenAI.Chat.ChatCompletionCreateParams,
    cacheControl: 'system_only' | 'all',
  ): {
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
    tools?: ChatCompletionToolWithCache[];
  } {
    const messages = request.messages;

    const systemIndex = messages.findIndex((msg) => msg.role === 'system');
    const lastIndex = messages.length - 1;

    const updatedMessages =
      messages.length === 0
        ? messages
        : messages.map((message, index) => {
            const shouldAddCacheControl = Boolean(
              (index === systemIndex && systemIndex !== -1) ||
                (index === lastIndex && cacheControl === 'all'),
            );

            if (
              !shouldAddCacheControl ||
              !('content' in message) ||
              message.content === null ||
              message.content === undefined
            ) {
              return message;
            }

            // For DashScope cache control, we need to convert string content to array format
            // when cache control is required (for streaming requests or when explicitly enabled)
            // This is required for the cache functionality to work
            if (typeof message.content === 'string') {
              // For string content in streaming requests, we convert to array format to add cache control
              const updatedContent = this.addCacheControlToContent(message.content) as ChatCompletionContentPartWithCache[];
              
              return {
                ...message,
                content: updatedContent,
              } as OpenAI.Chat.ChatCompletionMessageParam;
            } else {
              // For array content (multimodal), we can safely apply cache control
              const updatedContent = this.addCacheControlToContent(message.content) as ChatCompletionContentPartWithCache[];
              
              return {
                ...message,
                content: updatedContent,
              } as OpenAI.Chat.ChatCompletionMessageParam;
            }
          });

    const updatedTools =
      cacheControl === 'all' && request.tools?.length
        ? this.addCacheControlToTools(request.tools)
        : (request.tools as ChatCompletionToolWithCache[] | undefined);

    return {
      messages: updatedMessages,
      tools: updatedTools,
    };
  }

  private addCacheControlToTools(
    tools: OpenAI.Chat.ChatCompletionTool[],
  ): ChatCompletionToolWithCache[] {
    if (tools.length === 0) {
      return tools as ChatCompletionToolWithCache[];
    }

    const updatedTools = [...tools] as ChatCompletionToolWithCache[];
    const lastToolIndex = tools.length - 1;
    updatedTools[lastToolIndex] = {
      ...updatedTools[lastToolIndex],
      cache_control: { type: 'ephemeral' },
    };

    return updatedTools;
  }

  /**
   * Add cache control to message content, handling both string and array formats
   * For DashScope compatibility, we need to maintain the original format when possible
   * but add cache control where required
   */
  private addCacheControlToContent(
    content: NonNullable<OpenAI.Chat.ChatCompletionMessageParam['content']>,
  ): string | ChatCompletionContentPartWithCache[] {
    // If content is a string and we need to add cache control, 
    // we must convert to array format to include cache_control
    if (typeof content === 'string') {
      const contentArray = this.normalizeContentToArray(content);
      return this.addCacheControlToContentArray(contentArray);
    }
    
    // If content is already an array, process it as multimodal content
    return this.addCacheControlToContentArray(content as ChatCompletionContentPartWithCache[]);
  }

  /**
   * Normalize content to array format
   */
  private normalizeContentToArray(
    content: NonNullable<OpenAI.Chat.ChatCompletionMessageParam['content']>,
  ): ChatCompletionContentPartWithCache[] {
    if (typeof content === 'string') {
      return [
        {
          type: 'text',
          text: content,
        } as ChatCompletionContentPartTextWithCache,
      ];
    }
    return [...content] as ChatCompletionContentPartWithCache[];
  }

  /**
   * Add cache control to the content array
   */
  private addCacheControlToContentArray(
    contentArray: ChatCompletionContentPartWithCache[],
  ): ChatCompletionContentPartWithCache[] {
    if (contentArray.length === 0) {
      return [
        {
          type: 'text',
          text: '',
          cache_control: { type: 'ephemeral' },
        } as ChatCompletionContentPartTextWithCache,
      ];
    }

    const lastItem = contentArray[contentArray.length - 1];

    if (lastItem.type === 'text') {
      // Add cache_control to the last text item
      contentArray[contentArray.length - 1] = {
        ...lastItem,
        cache_control: { type: 'ephemeral' },
      } as ChatCompletionContentPartTextWithCache;
    } else {
      // If the last item is not text, add a new text item with cache_control
      contentArray.push({
        type: 'text',
        text: '',
        cache_control: { type: 'ephemeral' },
      } as ChatCompletionContentPartTextWithCache);
    }

    return contentArray;
  }

  private isVisionModel(model: string | undefined): boolean {
    if (!model) {
      return false;
    }

    const normalized = model.toLowerCase();

    if (normalized === 'vision-model') {
      return true;
    }

    if (normalized.startsWith('qwen-vl')) {
      return true;
    }

    if (normalized.startsWith('qwen3-vl-plus')) {
      return true;
    }

    return false;
  }

  /**
   * Apply output token limit to a request's max_tokens parameter.
   *
   * Ensures that existing max_tokens parameters don't exceed the model's maximum output
   * token limit. Only modifies max_tokens when already present in the request.
   *
   * @param request - The chat completion request parameters
   * @param model - The model name to get the output token limit for
   * @returns The request with max_tokens adjusted to respect the model's limits (if present)
   */
  private applyOutputTokenLimit<T extends { max_tokens?: number | null }>(
    request: T,
    model: string,
  ): T {
    const currentMaxTokens = request.max_tokens;

    // Only process if max_tokens is already present in the request
    if (currentMaxTokens === undefined || currentMaxTokens === null) {
      return request; // No max_tokens parameter, return unchanged
    }

    const modelLimit = tokenLimit(model, 'output');

    // If max_tokens exceeds the model limit, cap it to the model's limit
    if (currentMaxTokens > modelLimit) {
      return {
        ...request,
        max_tokens: modelLimit,
      };
    }

    // If max_tokens is within the limit, return the request unchanged
    return request;
  }

  /**
   * Check if cache control should be disabled based on configuration.
   *
   * @returns true if cache control should be disabled, false otherwise
   */
  private shouldDisableCacheControl(): boolean {
    return (
      this.cliConfig.getContentGeneratorConfig()?.disableCacheControl === true
    );
  }
}
