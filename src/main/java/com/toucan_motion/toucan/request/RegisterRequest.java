package com.toucan_motion.toucan.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RegisterRequest {
    @Email @NotBlank private String email;
    @NotBlank private String name;
    @NotBlank private String password;
}