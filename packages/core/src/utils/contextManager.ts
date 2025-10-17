/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part, GenerateContentConfig } from '@google/genai';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { tokenLimit } from '../core/tokenLimits.js';
import { getDefaultTokenizer } from './request-tokenizer/index.js';
import { getResponseText } from './partUtils.js';

/**
 * Context manager that handles long context by automatically splitting, summarizing, and reassembling
 */
export class ContextManager {
  private tokenizer = getDefaultTokenizer();

  constructor(private config: Config) {}

  /**
   * Process content that might exceed token limits by splitting and summarizing
   */
  async processLongContext(
    contents: Content[],
    contentGenerator: ContentGenerator,
    model?: string,
    config?: GenerateContentConfig
  ): Promise<Content[]> {
    const actualModel = model || this.config.getModel();
    const maxTokens = tokenLimit(actualModel, 'input');
    
    // Calculate total tokens in the input
    const tokenCount = await this.calculateTokens(contents);
    
    // If within limits, return original content
    if (tokenCount <= maxTokens * 0.9) { // Use 90% as safety margin
      return contents;
    }
    
    // Split and summarize if exceeding limits
    return await this.splitAndSummarize(contents, contentGenerator, actualModel, config);
  }

  /**
   * Calculate token count for content
   */
  private async calculateTokens(contents: Content[]): Promise<number> {
    try {
      const result = await this.tokenizer.calculateTokens({
        contents,
        model: this.config.getModel(),
      });
      return result.totalTokens;
    } catch (error) {
      console.warn('Token calculation failed, using fallback:', error);
      // Fallback: estimate based on character count
      const text = this.contentsToString(contents);
      return Math.ceil(text.length / 4); // Rough estimate: 1 token ~ 4 characters
    }
  }

  /**
   * Convert contents to string for fallback token estimation
   */
  private contentsToString(contents: Content[]): string {
    let result = '';
    for (const content of contents) {
      if (content.parts) {
        for (const part of content.parts) {
          if ('text' in part && part.text) {
            result += part.text + ' ';
          }
        }
      }
    }
    return result;
  }

  /**
   * Split content into chunks and summarize each chunk
   */
  private async splitAndSummarize(
    contents: Content[],
    contentGenerator: ContentGenerator,
    model: string,
    config?: GenerateContentConfig
  ): Promise<Content[]> {
    const maxTokens = tokenLimit(model, 'input');
    const safeLimit = Math.floor(maxTokens * 0.8); // Use 80% for safety when summarizing

    // Split the contents into chunks that are within the safe limit
    const chunks = await this.splitContents(contents, safeLimit);
    
    // Summarize each chunk
    const summarizedChunks: Content[] = [];
    for (const chunk of chunks) {
      const tokenCount = await this.calculateTokens([chunk]);
      
      if (tokenCount > safeLimit * 0.7) { // Only summarize if chunk is large enough
        const summary = await this.summarizeChunk([chunk], contentGenerator, model, config);
        summarizedChunks.push({
          role: 'user',
          parts: [{ text: `Previous conversation summary: ${summary}` }]
        });
      } else {
        // If chunk is small, keep it as is
        summarizedChunks.push(chunk);
      }
    }

    // Check if the combined summary is still too large, and recursively summarize if needed
    const finalTokenCount = await this.calculateTokens(summarizedChunks);
    if (finalTokenCount > maxTokens * 0.9) {
      return await this.splitAndSummarize(summarizedChunks, contentGenerator, model, config);
    }

    return summarizedChunks;
  }

  /**
   * Split contents into chunks that are within the token limit
   */
  private async splitContents(contents: Content[], maxTokens: number): Promise<Content[]> {
    const chunks: Content[] = [];
    let currentChunk: Content[] = [];
    let currentTokenCount = 0;

    for (const content of contents) {
      const contentTokens = await this.calculateTokens([content]);
      
      // If a single content item exceeds the limit, we need to split it further
      if (contentTokens > maxTokens) {
        if (currentChunk.length > 0) {
          chunks.push(this.combineContents(currentChunk));
          currentChunk = [];
          currentTokenCount = 0;
        }
        
        // Split the large content item
        const subChunks = await this.splitLargeContent(content, maxTokens);
        chunks.push(...subChunks);
      } else {
        // Check if adding this content would exceed the limit
        if (currentTokenCount + contentTokens > maxTokens && currentChunk.length > 0) {
          chunks.push(this.combineContents(currentChunk));
          currentChunk = [content];
          currentTokenCount = contentTokens;
        } else {
          currentChunk.push(content);
          currentTokenCount += contentTokens;
        }
      }
    }

    // Add the last chunk if it exists
    if (currentChunk.length > 0) {
      chunks.push(this.combineContents(currentChunk));
    }

    return chunks;
  }

  /**
   * Split a large content item into smaller parts
   */
  private async splitLargeContent(content: Content, maxTokens: number): Promise<Content[]> {
    const chunks: Content[] = [];
    
    if (content.parts) {
      // For now, handle text parts splitting
      const textParts: Part[] = [];
      const otherParts: Part[] = [];
      
      for (const part of content.parts) {
        if ('text' in part && part.text) {
          textParts.push(part);
        } else {
          otherParts.push(part);
        }
      }
      
      if (textParts.length > 0) {
        // Combine all text parts and split them
        const fullText = textParts.map(p => (p as Part & { text: string }).text).join('\n');
        const textChunks = await this.splitText(fullText, maxTokens);
        
        for (const chunkText of textChunks) {
          chunks.push({
            role: content.role,
            parts: [{ text: chunkText }, ...otherParts]
          });
        }
      } else {
        // If no text parts, just return the original content
        chunks.push(content);
      }
    } else {
      chunks.push(content);
    }
    
    return chunks;
  }

  /**
   * Split text into chunks that are within the token limit
   */
  private async splitText(text: string, maxTokens: number): Promise<string[]> {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/g);
    
    let currentChunk = '';
    for (const sentence of sentences) {
      const testChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      const tokenCount = await this.calculateTokens([{
        role: 'user',
        parts: [{ text: testChunk }]
      }]);
      
      if (tokenCount > maxTokens && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk = testChunk;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  /**
   * Combine multiple content items into a single content item
   */
  private combineContents(contents: Content[]): Content {
    if (contents.length === 1) {
      return contents[0];
    }
    
    // Find the most common role in the chunk
    const roleCounts = new Map<string, number>();
    for (const content of contents) {
      const role = content.role || 'user';
      roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
    }
    
    const mainRole = Array.from(roleCounts.entries())
      .reduce((max, current) => current[1] > max[1] ? current : max)[0];
    
    const allParts: Part[] = [];
    for (const content of contents) {
      if (content.parts) {
        allParts.push(...content.parts);
      }
    }
    
    return {
      role: mainRole as 'user' | 'model',
      parts: allParts
    };
  }

  /**
   * Summarize a chunk of content
   */
  private async summarizeChunk(
    chunk: Content[],
    contentGenerator: ContentGenerator,
    model: string,
    config?: GenerateContentConfig
  ): Promise<string> {
    const summaryPrompt = `Please provide a concise summary of the following conversation history. Focus on preserving the most important context and information:

${this.contentsToString(chunk)}`;

    try {
      const result = await contentGenerator.generateContent({
        model,
        contents: [{
          role: 'user',
          parts: [{ text: summaryPrompt }]
        }],
        config: {
          ...config,
          maxOutputTokens: Math.min(500, Math.floor(tokenLimit(model, 'output') * 0.3)) // Limit summary to 30% of output tokens
        }
      }, 'context-summmary');

      return getResponseText(result) ?? '';
    } catch (error) {
      console.error('Error summarizing chunk:', error);
      // Fallback: return a simple truncation
      return this.contentsToString(chunk).substring(0, 500) + '...';
    }
  }
}