import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Container, Form, Spinner } from "react-bootstrap";
import { chat } from "../api/ai";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

const PROMPT_CATEGORIES_CONFIG = [
  {
    labels: { en: "📊 Sales", mk: "📊 Продажба" },
    prompts: {
      en: ["How much today?", "Top sellers this week?", "Sales summary"],
      mk: ["Колкав е прометот денес?", "Најпродавани оваа недела?", "Резиме на продажба"],
    },
  },
  {
    labels: { en: "📦 Inventory", mk: "📦 Залиха" },
    prompts: {
      en: ["What's running low?", "What needs restocking?"],
      mk: ["Што има ниска залиха?", "Што треба да се набави?"],
    },
  },
  {
    labels: { en: "🔍 Lookup", mk: "🔍 Пребарување" },
    prompts: {
      en: ["Tell me about Coca-Cola", "Find products with 'bread'"],
      mk: ["Кажи ми за Coca-Cola", "Најди продукти со 'леб'"],
    },
  },
];

const TOOL_LABELS = {
  get_low_stock_products: { en: "Checked low stock", mk: "Проверена ниска залиха" },
  get_top_selling_products: { en: "Checked top sellers", mk: "Проверени најпродавани" },
  get_revenue_total: { en: "Checked revenue", mk: "Проверен вкупен приход" },
  get_product_by_name: { en: "Looked up product", mk: "Пребаран продукт" },
  get_sales_summary: { en: "Checked sales summary", mk: "Проверено резиме на продажба" },
};

const WELCOME_MESSAGES = {
  mk: "Здраво! Јас сум StockMind 👋\n\nПрашајте ме било што за вашата продавница - промет, ниска залиха, најпродавани производи или детали за одреден производ. Веднаш ќе ги проверам податоците и ќе ви одговорам.\n\nИзберете еден од предлозите подолу или напишете прашање.",
  en: "Hi! I'm StockMind 👋\n\nAsk me anything about your store - sales numbers, what's running low, top sellers, or details about a specific product. I'll check the data and answer right away.\n\nPick a suggestion below or just type your question.",
};

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Assistant() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || "en").startsWith("mk") ? "mk" : "en";

  const storageKey = useMemo(
    () => `stockmind_chat_${user?.username || "guest"}`,
    [user?.username]
  );

  const getWelcomeMessage = () => ({
    role: "assistant",
    content: WELCOME_MESSAGES[lang] || WELCOME_MESSAGES.en,
    ts: new Date().toISOString(),
    isWelcome: true,
  });

  const [messages, setMessages] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      /* ignore */
    }
    return [getWelcomeMessage()];
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 &&
      (prev[0].isWelcome ||
        prev[0].content === WELCOME_MESSAGES.en ||
        prev[0].content === WELCOME_MESSAGES.mk)
        ? [{ ...prev[0], content: WELCOME_MESSAGES[lang], isWelcome: true }]
        : prev
    );
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      /* ignore quota errors */
    }
  }, [messages, storageKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const userMsg = {
      role: "user",
      content: text,
      ts: new Date().toISOString(),
    };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setLoading(true);

    try {
      const payload = newHistory
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await chat(payload);
      setMessages([
        ...newHistory,
        {
          role: "assistant",
          content: res.message,
          tools_used: res.tools_used || [],
          ts: new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages([
        ...newHistory,
        {
          role: "assistant",
          content: t("assistant.error_message", "Sorry, I had trouble answering. Try again in a moment."),
          error: true,
          ts: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleClearChat = () => {
    if (!window.confirm(t("assistant.clear_confirm", "Clear chat history? This cannot be undone."))) return;
    setMessages([getWelcomeMessage()]);
  };

  const isOnlyWelcome =
    messages.length === 1 &&
    (messages[0].isWelcome ||
      messages[0].content === WELCOME_MESSAGES.en ||
      messages[0].content === WELCOME_MESSAGES.mk);

  return (
    <Container fluid="lg" style={{ maxWidth: 960 }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="mb-0">{t("assistant.title")}</h1>
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={handleClearChat}
          disabled={isOnlyWelcome}
        >
          🗑 {t("assistant.clear_chat", "Clear chat")}
        </Button>
      </div>

      <div
        className="border rounded bg-white"
        style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 240px)", minHeight: 500 }}
      >
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: "auto" }}
          className="p-3"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={`mb-3 d-flex ${
                m.role === "user" ? "justify-content-end" : "justify-content-start"
              }`}
            >
              <div style={{ maxWidth: "78%" }}>
                {m.role === "assistant" && m.tools_used?.length > 0 && (
                  <div className="mb-1 d-flex flex-wrap gap-1">
                    {m.tools_used.map((tool, idx) => (
                      <Badge key={idx} bg="light" text="dark" className="border">
                        🔧 {TOOL_LABELS[tool]?.[lang] || TOOL_LABELS[tool]?.en || tool}
                      </Badge>
                    ))}
                  </div>
                )}
                <div
                  className={`p-3 rounded ${
                    m.role === "user"
                      ? "bg-primary text-white"
                      : m.error
                      ? "bg-danger-subtle border border-danger-subtle"
                      : "bg-light border"
                  }`}
                  style={{ whiteSpace: "pre-wrap" }}
                >
                  {m.content}
                </div>
                {m.ts && (
                  <div
                    className={`small text-muted mt-1 ${
                      m.role === "user" ? "text-end" : ""
                    }`}
                  >
                    {formatTime(m.ts)}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="d-flex justify-content-start mb-3">
              <div className="p-3 rounded bg-light border">
                <Spinner animation="grow" size="sm" className="me-1" />
                <Spinner animation="grow" size="sm" className="me-1" />
                <Spinner animation="grow" size="sm" />
              </div>
            </div>
          )}
        </div>

        {isOnlyWelcome && (
          <div className="border-top px-3 py-2 bg-light">
            <div className="d-flex flex-column gap-1">
              {PROMPT_CATEGORIES_CONFIG.map((cat, catIdx) => (
                <div
                  key={catIdx}
                  className="d-flex align-items-center flex-wrap gap-1"
                >
                  <div
                    className="text-muted small me-2"
                    style={{ minWidth: 90 }}
                  >
                    {cat.labels[lang] || cat.labels.en}
                  </div>
                  {(cat.prompts[lang] || cat.prompts.en).map((p) => (
                    <Button
                      key={p}
                      variant="outline-primary"
                      onClick={() => sendMessage(p)}
                      disabled={loading}
                      className="py-0 px-2"
                      style={{ fontSize: 12 }}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-top p-2">
          <Form onSubmit={handleSubmit}>
            <div className="d-flex gap-2">
              <Form.Control
                ref={inputRef}
                as="textarea"
                rows={1}
                placeholder={t("assistant.placeholder", "Ask anything about your store... (Enter to send, Shift+Enter for newline)")}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                autoFocus
                style={{ resize: "none" }}
              />
              <Button
                type="submit"
                variant="primary"
                disabled={loading || !input.trim()}
              >
                {t("assistant.send")}
              </Button>
            </div>
          </Form>
        </div>
      </div>
    </Container>
  );
}
