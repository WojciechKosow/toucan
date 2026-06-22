package com.toucan_motion.toucan.security;

import java.util.UUID;

import com.toucan_motion.toucan.entity.User;
import com.toucan_motion.toucan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.jetbrains.annotations.NotNull;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {
    private final UserRepository userRepository;

    @NotNull
    @Override
    public UserDetails loadUserByUsername(@NotNull String username) throws UsernameNotFoundException {
        return userRepository
                .findByEmail(username)
                .map(CustomUserDetails::new)
                .orElseThrow(() -> new UsernameNotFoundException("User not found."));
    }

    public UserDetails loadUserDetailsByUserId(String userId) {
        return userRepository
                .findById(UUID.fromString(userId))
                .map(CustomUserDetails::new)
                .orElseThrow(() -> new UsernameNotFoundException("User not found."));
    }

    public User loadUserEntityById(String userId) {
        return userRepository.findById(UUID.fromString(userId)).orElseThrow();
    }
}