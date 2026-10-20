"use client";

import { useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatPage() {
  const [message, setMessage] =
    useState("");

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  const [isLoading, setIsLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    const trimmedMessage =
      message.trim();

    if (!trimmedMessage) {
      return;
    }

    setIsLoading(true);
    setError("");

    const userMessage: ChatMessage = {
      role: "user",
      content: trimmedMessage,
    };

    /*
     * This is the conversation we send
     * to the backend.
     */
    const requestMessages = [
      ...messages,
      userMessage,
    ];

    /*
     * Immediately show:
     *
     * User bubble
     * Assistant empty bubble
     *
     * BEFORE waiting for fetch().
     */
    setMessages([
      ...requestMessages,
      {
        role: "assistant",
        content: "",
      },
    ]);

    setMessage("");

    try {
      const response = await fetch(
        "/api/chat",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            messages:
              requestMessages,

            stream: true,
          }),
        }
      );

      if (!response.ok) {
        let errorMessage =
          "Failed to send message.";

        try {
          const data =
            await response.json();

          if (data.reply) {
            errorMessage =
              data.reply;
          }
        } catch {
          // use default
        }

        throw new Error(
          errorMessage
        );
      }

      const contentType =
        response.headers.get(
          "content-type"
        ) ?? "";

      /*
       * ------------------------------
       * Normal JSON response
       * ------------------------------
       *
       * Used by deterministic guards,
       * for example:
       *
       * Please provide your order ID.
       */
      if (
        contentType.includes(
          "application/json"
        )
      ) {
        const data =
          await response.json();

        setMessages((current) => {
          const updated = [
            ...current,
          ];

          updated[
            updated.length - 1
          ] = {
            role: "assistant",
            content:
              data.reply ??
              "I wasn't able to complete the request.",
          };

          return updated;
        });

        return;
      }

      /*
       * ------------------------------
       * Streaming response
       * ------------------------------
       */
      if (!response.body) {
        throw new Error(
          "Response body is missing."
        );
      }

      const reader =
        response.body.getReader();

      const decoder =
        new TextDecoder();

      let assistantText = "";

      while (true) {
        const {
          value,
          done,
        } = await reader.read();

        if (done) {
          break;
        }

        const chunk =
          decoder.decode(
            value,
            {
              stream: true,
            }
          );

        assistantText +=
          chunk;

        /*
         * Update only the existing
         * assistant bubble.
         */
        setMessages(
          (current) => {
            const updated = [
              ...current,
            ];

            updated[
              updated.length - 1
            ] = {
              role: "assistant",
              content:
                assistantText,
            };

            return updated;
          }
        );

        /*
         * Give the browser a chance
         * to paint between chunks.
         */
        await new Promise<void>(
          (resolve) =>
            requestAnimationFrame(
              () => resolve()
            )
        );
      }

      /*
       * Flush decoder.
       */
      const finalChunk =
        decoder.decode();

      if (finalChunk) {
        assistantText +=
          finalChunk;

        setMessages(
          (current) => {
            const updated = [
              ...current,
            ];

            updated[
              updated.length - 1
            ] = {
              role: "assistant",
              content:
                assistantText,
            };

            return updated;
          }
        );
      }
    } catch (err) {
      console.error(
        "Chat error:",
        err
      );

      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to send message.";

      setError(errorMessage);

      /*
       * Replace empty assistant
       * bubble with error message.
       */
      setMessages((current) => {
        const updated = [
          ...current,
        ];

        if (
          updated.length > 0 &&
          updated[
            updated.length - 1
          ].role === "assistant"
        ) {
          updated[
            updated.length - 1
          ] = {
            role: "assistant",
            content:
              "Something went wrong.",
          };
        }

        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white p-6 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold mb-6">
          Customer Support Chat
        </h1>

        <div
          className="mb-6 space-y-4"
          aria-live="polite"
        >
          {messages.map(
            (msg, index) => (
              <div
                key={index}
                className={`flex ${
                  msg.role === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                    msg.role ===
                    "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-gray-200 text-gray-900 rounded-bl-sm"
                  }`}
                >
                  {msg.role ===
                    "assistant" &&
                  msg.content ===
                    "" &&
                  isLoading ? (
                    <span className="animate-pulse">
                      Thinking...
                    </span>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            )
          )}
        </div>

        <form
          onSubmit={
            handleSubmit
          }
          className="flex gap-2"
        >
          <input
            type="text"
            value={message}
            onChange={(e) =>
              setMessage(
                e.target.value
              )
            }
            placeholder="Type your message..."
            className="flex-1 p-3 border rounded-lg"
            disabled={
              isLoading
            }
          />

          <button
            type="submit"
            disabled={
              isLoading ||
              !message.trim()
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading
              ? "Sending..."
              : "Send"}
          </button>
        </form>

        {error && (
          <p className="mt-3 text-red-500">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}