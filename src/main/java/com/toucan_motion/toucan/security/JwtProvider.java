package com.toucan_motion.toucan.security;

import com.toucan_motion.toucan.entity.User;
import com.toucan_motion.toucan.repository.UserRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import java.security.Key;
import java.util.Date;
import java.util.UUID;
import java.util.function.Function;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class JwtProvider {

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${jwt.expiration}")
    private long expiration;

    private final UserRepository userRepository;

    public String generateToken(UUID userId, boolean rememberMe) {

        Date now = new Date();

        long expiry = rememberMe ? 30L * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;

        Date expiryDate = new Date(now.getTime() + expiry);

        return Jwts.builder()
                .setSubject(userId.toString())
                .setIssuedAt(now)
                .setExpiration(expiryDate)
                .claim("createdAt", now.toString())
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    public String extractEmailFromToken(String token) {
        if (token == null || token.isEmpty()) return null;
        String cleanToken = token.replace("Bearer ", "");
        try {
            String userId = extractClaimsFromToken(token, Claims::getSubject);
            UUID cleanUserId = UUID.fromString(userId);
            User user = userRepository.findById(cleanUserId).orElseThrow();
            return user.getEmail();
        } catch (Exception e) {
            return null;
        }
    }

    public <T> T extractClaimsFromToken(String token, Function<Claims, T> claimsResolver) {
        final Claims claims =
                Jwts.parserBuilder().setSigningKey(getSigningKey()).build().parseClaimsJws(token).getBody();
        return claimsResolver.apply(claims);
    }

    public Key getSigningKey() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes());
    }

    public boolean validateToken(String token) {
        System.out.println("validating");
        try {
            Jwts.parserBuilder().setSigningKey(getSigningKey()).build().parseClaimsJws(token);
            System.out.println("validating - success");
            return true;
        } catch (Exception e) {
            System.out.println("validating - error");
            return false;
        }
    }
}