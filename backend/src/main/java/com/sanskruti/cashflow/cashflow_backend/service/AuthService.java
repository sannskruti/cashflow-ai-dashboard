package com.sanskruti.cashflow.cashflow_backend.service;

import com.sanskruti.cashflow.cashflow_backend.config.AuthProperties;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AuthService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final AuthProperties authProperties;
    private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();

    public AuthService(AuthProperties authProperties) {
        this.authProperties = authProperties;
    }

    public Optional<LoginResult> login(String username, String password) {
        if (!secureEquals(username, authProperties.getDemoUsername())
                || !secureEquals(password, authProperties.getDemoPassword())) {
            return Optional.empty();
        }

        String token = generateToken();
        Instant expiresAt = Instant.now().plus(Duration.ofMinutes(authProperties.getTokenTtlMinutes()));
        sessions.put(token, new Session(username, expiresAt));
        return Optional.of(new LoginResult(token, username, expiresAt));
    }

    public Optional<String> validate(String token) {
        Session session = sessions.get(token);
        if (session == null) {
            return Optional.empty();
        }
        if (session.expiresAt().isBefore(Instant.now())) {
            sessions.remove(token);
            return Optional.empty();
        }
        return Optional.of(session.username());
    }

    public void logout(String token) {
        sessions.remove(token);
    }

    private String generateToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private boolean secureEquals(String left, String right) {
        byte[] leftBytes = left == null ? new byte[0] : left.getBytes(StandardCharsets.UTF_8);
        byte[] rightBytes = right == null ? new byte[0] : right.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(leftBytes, rightBytes);
    }

    public record LoginResult(String token, String username, Instant expiresAt) {}

    private record Session(String username, Instant expiresAt) {}
}
