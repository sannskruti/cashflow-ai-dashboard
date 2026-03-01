package com.sanskruti.cashflow.cashflow_backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanskruti.cashflow.cashflow_backend.api.dto.AiInsightsResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class AiInsightsService {

    private static final long MIN_INTERVAL_MS = 1000; // 1 call per second (well within Tier 1 500 RPM)
    private final AtomicLong lastCallTime = new AtomicLong(0);

    private final WebClient webClient;
    private final ObjectMapper objectMapper;
    private final String model;

    public AiInsightsService(
            ObjectMapper objectMapper,
            @Value("${ai.openai.apiKey}") String apiKey,
            @Value("${ai.openai.model}") String model
    ) {
        this.objectMapper = objectMapper;
        this.model = model;

        this.webClient = WebClient.builder()
                .baseUrl("https://api.openai.com/v1")
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    public AiInsightsResponse generateInsights(String groundedJson) throws Exception {

        String system = """
                You are a financial risk analyst.
                Output ONLY valid JSON matching this schema:
                {
                  "executiveSummary": string,
                  "keyDrivers": string[],
                  "recommendations": [{"action":string,"impact":string,"effort":string,"timeframe":string}],
                  "confidence": number,
                  "notes": string[]
                }
                Do not invent numbers. Use only the provided data.
                Keep executiveSummary under 4 sentences.
                recommendations: 3 to 5 items, concrete actions.
                """;

        Map<String, Object> body = Map.of(
                "model", model,
                "temperature", 0.2,
                "response_format", Map.of("type", "json_object"),
                "messages", List.of(
                        Map.of("role", "system", "content", system),
                        Map.of("role", "user", "content", groundedJson)
                ),
                "max_tokens", 700
        );

        // Rate limiter: enforce minimum interval between OpenAI calls
        long now = System.currentTimeMillis();
        long wait = MIN_INTERVAL_MS - (now - lastCallTime.get());
        if (wait > 0) Thread.sleep(wait);
        lastCallTime.set(System.currentTimeMillis());

        // Call OpenAI with per-status error handling
        Map<?, ?> resp = webClient.post()
                .uri("/chat/completions")
                .bodyValue(body)
                .retrieve()
                .onStatus(status -> status.value() == 401,
                        cr -> Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                                "Invalid OpenAI API key")))
                .onStatus(status -> status.value() == 429,
                        cr -> Mono.error(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                                "OpenAI rate limit reached — please wait a moment and try again")))
                .onStatus(status -> status.value() == 400,
                        cr -> Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST,
                                "OpenAI rejected the request — check model name or prompt")))
                .onStatus(status -> status.is5xxServerError(),
                        cr -> Mono.error(new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                                "OpenAI service error — try again later")))
                .bodyToMono(Map.class)
                .block();

        if (resp == null) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Empty response from OpenAI");
        }

        List<?> choices = (List<?>) resp.get("choices");
        if (choices == null || choices.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI returned no choices");
        }

        Map<?, ?> c0 = (Map<?, ?>) choices.get(0);
        Map<?, ?> msg = (Map<?, ?>) c0.get("message");
        String content = (String) msg.get("content");

        if (content == null || content.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI returned empty content");
        }

        try {
            return objectMapper.readValue(content, AiInsightsResponse.class);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to parse AI response: " + e.getMessage());
        }
    }
}
