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
    private final ConcurrentHashMap<String, String> users = new ConcurrentHashMap<>();

    public AuthService(AuthProperties authProperties) {
        this.authProperties = authProperties;
        users.put(authProperties.getDemoUsername(), authProperties.getDemoPassword());
    }

    public Optional<LoginResult> login(String username, String password) {
        String savedPassword = users.get(username);
        if (savedPassword == null || !secureEquals(password, savedPassword)) {
            return Optional.empty();
        }

        String token = generateToken();
        Instant expiresAt = Instant.now().plus(Duration.ofMinutes(authProperties.getTokenTtlMinutes()));
        sessions.put(token, new Session(username, expiresAt));
        return Optional.of(new LoginResult(token, username, expiresAt));
    }

    public boolean signup(String username, String password) {
        validateCredentials(username, password);
        return users.putIfAbsent(username, password) == null;
    }

    public boolean resetPassword(String username, String newPassword) {
        validateCredentials(username, newPassword);
        if (!users.containsKey(username)) {
            return false;
        }
        users.put(username, newPassword);
        return true;
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

    private void validateCredentials(String username, String password) {
        if (username == null || username.isBlank()) {
            throw new IllegalArgumentException("Username is required");
        }
        if (password == null || password.length() < 6) {
            throw new IllegalArgumentException("Password must be at least 6 characters");
        }
    }

    public record LoginResult(String token, String username, Instant expiresAt) {}

    private record Session(String username, Instant expiresAt) {}
}
