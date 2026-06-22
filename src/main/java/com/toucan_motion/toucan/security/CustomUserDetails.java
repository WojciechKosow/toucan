package com.toucan_motion.toucan.security;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import com.toucan_motion.toucan.entity.Role;
import com.toucan_motion.toucan.entity.User;
import lombok.AllArgsConstructor;
import lombok.RequiredArgsConstructor;
import org.jetbrains.annotations.NotNull;
import org.jspecify.annotations.Nullable;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

@AllArgsConstructor
@RequiredArgsConstructor
public class CustomUserDetails implements UserDetails {
    private User user;

    public UUID getId() {
        return user.getId();
    }

    public User getUser() {
        return user;
    }

    public boolean isAdmin() {
        return user.getRole() == Role.ADMIN;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));
    }

    @Override
    public @Nullable String getPassword() {
        return user.getPassword();
    }

    @NotNull
    @Override
    public String getUsername() {
        return user.getEmail();
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return user.isEnabled();
    }
}