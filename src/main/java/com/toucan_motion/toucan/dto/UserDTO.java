package com.toucan_motion.toucan.dto;

import com.toucan_motion.toucan.entity.Role;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDTO {
    private UUID id;
    private String email;
    private String name;
    private Role role;
    private boolean verified;
    private LocalDateTime createdAt;
}