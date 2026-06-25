package com.toucan_motion.toucan.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates service-to-service calls on {@code /api/internal/**} with a shared secret in the
 * {@code X-Internal-Token} header — the renderer's identity, entirely separate from the user JWT.
 * On a valid token it grants {@code ROLE_INTERNAL}; otherwise it leaves the request unauthenticated
 * and {@code SecurityConfig} rejects it with 401/403.
 */
@Component
public class InternalAuthFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Internal-Token";

    private final String token;

    public InternalAuthFilter(@Value("${app.internal.render-token:}") String token) {
        this.token = token;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (request.getRequestURI().startsWith("/api/internal/")
                && !token.isBlank()
                && constantTimeEquals(token, request.getHeader(HEADER))) {
            var auth =
                    new UsernamePasswordAuthenticationToken(
                            "renderer", null, List.of(new SimpleGrantedAuthority("ROLE_INTERNAL")));
            SecurityContextHolder.getContext().setAuthentication(auth);
        }
        filterChain.doFilter(request, response);
    }

    private static boolean constantTimeEquals(String expected, String provided) {
        if (provided == null) {
            return false;
        }
        return java.security.MessageDigest.isEqual(
                expected.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                provided.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
