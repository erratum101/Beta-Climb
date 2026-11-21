package ru.betaclimb.controllers;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.web.util.WebUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Pattern;

final class BrowserOwner {
    private static final String COOKIE = "betaclimb-owner";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");

    private BrowserOwner() {}

    static String resolve(HttpServletRequest request, HttpServletResponse response) {
        Cookie cookie = WebUtils.getCookie(request, COOKIE);
        String token;
        if (cookie != null && cookie.getValue() != null && TOKEN.matcher(cookie.getValue()).matches()) {
            token = cookie.getValue();
        } else {
            byte[] secret = new byte[32];
            RANDOM.nextBytes(secret);
            token = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
            ResponseCookie issued = ResponseCookie.from(COOKIE, token).path("/api").httpOnly(true)
                    .sameSite("Lax").secure(request.isSecure()).maxAge(Duration.ofDays(365)).build();
            response.addHeader(HttpHeaders.SET_COOKIE, issued.toString());
        }
        response.setHeader(HttpHeaders.CACHE_CONTROL, "private, no-store");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }
}
